import { Test, TestingModule } from '@nestjs/testing';
import { JudgeService } from './judge.service';
import { ANTHROPIC } from '../shared/anthropic.module';
import { DB } from '../db/db.module';
import { PromptsService } from '../prompts/prompts.service';
import type { ExtractedTask } from './types';

describe('JudgeService', () => {
  let service: JudgeService;
  let mockAnthropicCreate: jest.Mock;

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
    mockAnthropicCreate = jest.fn();

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
        { provide: ANTHROPIC, useValue: { messages: { create: mockAnthropicCreate } } },
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
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"verdict":"KEEP","reason":"Clear actionable task"}' }],
      usage: { input_tokens: 200, output_tokens: 30, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    });

    const result = await service.judge(mockTask, 'sig-001');
    expect(result.verdict).toBe('KEEP');
  });

  it('returns DISMISS verdict', async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"verdict":"DISMISS","reason":"FYI content"}' }],
      usage: { input_tokens: 200, output_tokens: 30, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    });

    const result = await service.judge(mockTask, 'sig-001');
    expect(result.verdict).toBe('DISMISS');
  });

  it('returns REVIEW verdict', async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"verdict":"REVIEW","reason":"Ambiguous assignee"}' }],
      usage: { input_tokens: 200, output_tokens: 30, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    });

    const result = await service.judge(mockTask, 'sig-001');
    expect(result.verdict).toBe('REVIEW');
  });

  it('fails open to REVIEW on invalid JSON', async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'not json' }],
      usage: { input_tokens: 200, output_tokens: 30, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    });

    const result = await service.judge(mockTask, 'sig-001');
    expect(result.verdict).toBe('REVIEW');
    expect(result.reason).toContain('invalid');
  });

  it('fails open to REVIEW on missing fields', async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"verdict":"KEEP"}' }],
      usage: { input_tokens: 200, output_tokens: 30, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    });

    const result = await service.judge(mockTask, 'sig-001');
    // Missing "reason" field should cause Zod parse to fail → REVIEW
    expect(result.verdict).toBe('REVIEW');
  });
});
