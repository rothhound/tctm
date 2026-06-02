import { Test, TestingModule } from '@nestjs/testing';
import { SnoozeService } from './snooze.service';
import { LlmService } from '../shared/llm/llm.service';

function completion(text: string) {
  return {
    text,
    provider: 'anthropic' as const,
    model: 'claude-haiku-4-5-20251001',
    usage: { inputTokens: 50, outputTokens: 20, cacheReadTokens: 0, cacheCreationTokens: 0 },
    costUsd: 0,
  };
}

describe('SnoozeService', () => {
  let service: SnoozeService;
  let mockComplete: jest.Mock;

  beforeEach(async () => {
    mockComplete = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SnoozeService,
        { provide: LlmService, useValue: { complete: mockComplete } },
      ],
    }).compile();

    service = module.get<SnoozeService>(SnoozeService);
  });

  it('parses "next Tuesday" into an ISO date', async () => {
    mockComplete.mockResolvedValue(
      completion('{"date":"2026-05-26T09:00:00Z","confidence":0.95,"interpretation":"next Tuesday morning"}'),
    );

    const result = await service.parseNaturalLanguage('next Tuesday');
    expect(result.date).toBe('2026-05-26T09:00:00Z');
    expect(result.confidence).toBe(0.95);
  });

  it('returns null date on unparseable input', async () => {
    mockComplete.mockResolvedValue(
      completion('{"date":null,"confidence":0.1,"interpretation":"unclear timing"}'),
    );

    const result = await service.parseNaturalLanguage('sometime later');
    expect(result.date).toBeNull();
    expect(result.confidence).toBe(0.1);
  });

  it('returns fallback on API error', async () => {
    mockComplete.mockRejectedValue(new Error('API down'));

    const result = await service.parseNaturalLanguage('tomorrow');
    expect(result.date).toBeNull();
    expect(result.confidence).toBe(0);
  });
});
