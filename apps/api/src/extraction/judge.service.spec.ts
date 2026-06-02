import { Test, TestingModule } from '@nestjs/testing';
import { JudgeService } from './judge.service';
import { LlmService } from '../shared/llm/llm.service';
import { DB } from '../db/db.module';
import { PromptsService } from '../prompts/prompts.service';
import type { ExtractedTask } from './types';

/** Build an LlmService.complete() result wrapping the given model text. */
function completion(text: string) {
  return {
    text,
    provider: 'anthropic' as const,
    model: 'claude-haiku-4-5-20251001',
    usage: { inputTokens: 200, outputTokens: 30, cacheReadTokens: 0, cacheCreationTokens: 0 },
    costUsd: 0,
  };
}

describe('JudgeService', () => {
  let service: JudgeService;
  let mockComplete: jest.Mock;

  const mockTask: ExtractedTask = {
    title: 'Send cap table to Roelof',
    description: 'Sequoia needs it',
    type: 'do',
    entityRefs: [{ mention: 'Roelof', entityId: 'ent-001' }],
    sourceQuote: 'send over the cap table',
    signals: {
      explicitness: 0.95,
      actionability: 0.95,
      addressedToUser: 0.95,
      entityMatchConfidence: 0.9,
      temporalClarity: 0.85,
    },
    overallConfidence: 0.92,
    ambiguityFlags: [],
  };

  beforeEach(async () => {
    mockComplete = jest.fn();

    const mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockResolvedValue([]),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JudgeService,
        {
          provide: LlmService,
          useValue: { complete: mockComplete, modelFor: jest.fn().mockReturnValue('claude-haiku-4-5-20251001') },
        },
        { provide: DB, useValue: mockDb },
        {
          provide: PromptsService,
          useValue: {
            getActivePrompt: jest.fn().mockResolvedValue({
              id: 'pv-002', purpose: 'judge', version: 1, active: true,
              content: 'You are a quality-control judge...',
            }),
          },
        },
      ],
    }).compile();

    service = module.get<JudgeService>(JudgeService);
  });

  it('returns KEEP verdict', async () => {
    mockComplete.mockResolvedValue(completion('{"verdict":"KEEP","reason":"Clear actionable task"}'));

    const result = await service.judge(mockTask, 'sig-001');
    expect(result.verdict).toBe('KEEP');
  });

  it('returns DISMISS verdict', async () => {
    mockComplete.mockResolvedValue(completion('{"verdict":"DISMISS","reason":"FYI content"}'));

    const result = await service.judge(mockTask, 'sig-001');
    expect(result.verdict).toBe('DISMISS');
  });

  it('returns REVIEW verdict', async () => {
    mockComplete.mockResolvedValue(completion('{"verdict":"REVIEW","reason":"Ambiguous assignee"}'));

    const result = await service.judge(mockTask, 'sig-001');
    expect(result.verdict).toBe('REVIEW');
  });

  it('fails open to REVIEW on invalid JSON', async () => {
    mockComplete.mockResolvedValue(completion('not json'));

    const result = await service.judge(mockTask, 'sig-001');
    expect(result.verdict).toBe('REVIEW');
    expect(result.reason).toContain('invalid');
  });

  it('fails open to REVIEW on missing fields', async () => {
    mockComplete.mockResolvedValue(completion('{"verdict":"KEEP"}'));

    const result = await service.judge(mockTask, 'sig-001');
    // Missing "reason" field should cause Zod parse to fail → REVIEW
    expect(result.verdict).toBe('REVIEW');
  });
});
