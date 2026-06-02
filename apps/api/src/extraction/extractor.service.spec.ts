import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ExtractorService } from './extractor.service';
import { EntitiesService } from '../entities/entities.service';
import { PromptsService } from '../prompts/prompts.service';
import { LlmService } from '../shared/llm/llm.service';
import { DB } from '../db/db.module';
const validOutput = require('../../test/fixtures/extraction/valid-output.json');
const noTaskOutput = require('../../test/fixtures/extraction/no-task.json');

/** Build an LlmService.complete() result wrapping the given model text. */
function completion(text: string) {
  return {
    text,
    provider: 'anthropic' as const,
    model: 'claude-opus-4-7',
    usage: { inputTokens: 500, outputTokens: 200, cacheReadTokens: 4000, cacheCreationTokens: 0 },
    costUsd: 0.01,
  };
}

describe('ExtractorService', () => {
  let service: ExtractorService;
  let mockComplete: jest.Mock;
  let mockDbInsert: jest.Mock;

  const mockInput = {
    signalId: 'sig-001',
    source: 'slack',
    subSource: 'slack_dm',
    authorName: 'John Doe',
    authorEmail: 'john@example.com',
    title: 'Slack DM from John',
    body: 'Can you send the updated cap table by Friday?',
    occurredAt: '2026-05-19T10:00:00Z',
  };

  beforeEach(async () => {
    mockComplete = jest.fn();
    mockDbInsert = jest.fn().mockReturnValue({ values: jest.fn().mockResolvedValue([]) });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExtractorService,
        {
          provide: LlmService,
          useValue: { complete: mockComplete, modelFor: jest.fn().mockReturnValue('claude-opus-4-7') },
        },
        {
          provide: DB,
          useValue: { insert: mockDbInsert },
        },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              if (key === 'PARTNER_NAME') return 'Jane Doe';
              if (key === 'PARTNER_ROLE') return 'Managing Partner';
              throw new Error(`Unknown key: ${key}`);
            },
            get: (key: string, def?: any) => {
              if (key === 'PARTNER_ALIASES') return 'JD, Janie';
              return def;
            },
          },
        },
        {
          provide: EntitiesService,
          useValue: {
            renderGlossaryXml: jest.fn().mockResolvedValue('<entities></entities>'),
          },
        },
        {
          provide: PromptsService,
          useValue: {
            getActivePrompt: jest.fn().mockResolvedValue({
              id: 'pv-001', purpose: 'extract', version: 1, active: true,
              // {{PARTNER_NAME}} appears twice on purpose — verifies the global (not first-only) replace.
              content:
                'Assistant for {{PARTNER_NAME}} ({{PARTNER_ROLE}}). You = {{PARTNER_NAME}}; aliases: {{PARTNER_ALIASES}}.\n{{ENTITY_GLOSSARY}}',
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ExtractorService>(ExtractorService);
  });

  it('parses valid extraction output', async () => {
    mockComplete.mockResolvedValue(completion(JSON.stringify(validOutput)));

    const result = await service.extract(mockInput);

    expect(result.noTask).toBe(false);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].title).toBe('Send updated Acme cap table to Roelof');
    expect(result.tasks[0].signals.explicitness).toBe(0.95);
  });

  it('handles noTask response', async () => {
    mockComplete.mockResolvedValue(completion(JSON.stringify(noTaskOutput)));

    const result = await service.extract(mockInput);

    expect(result.noTask).toBe(true);
    expect(result.tasks).toHaveLength(0);
  });

  it('throws on invalid JSON output', async () => {
    mockComplete.mockResolvedValue(completion('not valid json at all'));

    await expect(service.extract(mockInput)).rejects.toThrow('Invalid extractor output');
  });

  it('writes audit log on every call', async () => {
    mockComplete.mockResolvedValue(completion(JSON.stringify(validOutput)));

    await service.extract(mockInput);

    expect(mockDbInsert).toHaveBeenCalled();
  });

  it('requests prompt caching for the (large, stable) extraction system prompt', async () => {
    mockComplete.mockResolvedValue(completion(JSON.stringify(validOutput)));

    await service.extract(mockInput);

    const callArgs = mockComplete.mock.calls[0][0];
    expect(callArgs.purpose).toBe('extract');
    expect(callArgs.cacheSystem).toBe(true);
  });

  it('replaces every placeholder (global) and injects partner name + aliases', async () => {
    mockComplete.mockResolvedValue(completion(JSON.stringify(validOutput)));

    await service.extract(mockInput);

    const system = mockComplete.mock.calls[0][0].system as string;
    expect(system).toContain('Jane Doe'); // name injected
    expect(system).toContain('JD, Janie'); // aliases injected
    expect(system).not.toContain('{{'); // no leftover placeholders (proves global replace, not first-only)
  });

  it('injects an explicit-capture override (forbidding noTask) only when explicitCapture is set', async () => {
    mockComplete.mockResolvedValue(completion(JSON.stringify(validOutput)));

    await service.extract({ ...mockInput, explicitCapture: true });
    const explicitSystem = mockComplete.mock.calls[0][0].system as string;
    expect(explicitSystem).toContain('EXPLICIT CAPTURE');
    expect(explicitSystem).toContain('Jane Doe'); // partner name substituted into the directive

    mockComplete.mockClear();
    await service.extract(mockInput);
    expect(mockComplete.mock.calls[0][0].system).not.toContain('EXPLICIT CAPTURE');
  });
});
