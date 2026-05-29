import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ExtractorService } from './extractor.service';
import { EntitiesService } from '../entities/entities.service';
import { PromptsService } from '../prompts/prompts.service';
import { ANTHROPIC } from '../shared/anthropic.module';
import { DB } from '../db/db.module';
const validOutput = require('../../test/fixtures/extraction/valid-output.json');
const noTaskOutput = require('../../test/fixtures/extraction/no-task.json');

describe('ExtractorService', () => {
  let service: ExtractorService;
  let mockAnthropicCreate: jest.Mock;
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
    mockAnthropicCreate = jest.fn();
    mockDbInsert = jest.fn().mockReturnValue({ values: jest.fn().mockResolvedValue([]) });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExtractorService,
        {
          provide: ANTHROPIC,
          useValue: { messages: { create: mockAnthropicCreate } },
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
              content: 'You are a task extraction assistant for {{PARTNER_NAME}}, a {{PARTNER_ROLE}}.\n{{ENTITY_GLOSSARY}}',
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ExtractorService>(ExtractorService);
  });

  it('parses valid extraction output', async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(validOutput) }],
      usage: {
        input_tokens: 500,
        output_tokens: 200,
        cache_read_input_tokens: 4000,
        cache_creation_input_tokens: 0,
      },
    });

    const result = await service.extract(mockInput);

    expect(result.noTask).toBe(false);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].title).toBe('Send updated Acme cap table to Roelof');
    expect(result.tasks[0].signals.explicitness).toBe(0.95);
  });

  it('handles noTask response', async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(noTaskOutput) }],
      usage: { input_tokens: 200, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    });

    const result = await service.extract(mockInput);

    expect(result.noTask).toBe(true);
    expect(result.tasks).toHaveLength(0);
  });

  it('throws on invalid JSON output', async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'not valid json at all' }],
      usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    });

    await expect(service.extract(mockInput)).rejects.toThrow('Invalid extractor output');
  });

  it('writes audit log on every call', async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(validOutput) }],
      usage: { input_tokens: 500, output_tokens: 200, cache_read_input_tokens: 4000, cache_creation_input_tokens: 0 },
    });

    await service.extract(mockInput);

    expect(mockDbInsert).toHaveBeenCalled();
  });

  it('uses prompt caching via cache_control in system message', async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(validOutput) }],
      usage: { input_tokens: 500, output_tokens: 200, cache_read_input_tokens: 4000, cache_creation_input_tokens: 0 },
    });

    await service.extract(mockInput);

    const callArgs = mockAnthropicCreate.mock.calls[0][0];
    expect(callArgs.system[0].cache_control).toEqual({ type: 'ephemeral' });
  });
});
