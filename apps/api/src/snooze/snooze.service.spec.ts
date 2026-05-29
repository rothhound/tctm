import { Test, TestingModule } from '@nestjs/testing';
import { SnoozeService } from './snooze.service';
import { ANTHROPIC } from '../shared/anthropic.module';

describe('SnoozeService', () => {
  let service: SnoozeService;
  let mockCreate: jest.Mock;

  beforeEach(async () => {
    mockCreate = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SnoozeService,
        { provide: ANTHROPIC, useValue: { messages: { create: mockCreate } } },
      ],
    }).compile();

    service = module.get<SnoozeService>(SnoozeService);
  });

  it('parses "next Tuesday" into an ISO date', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"date":"2026-05-26T09:00:00Z","confidence":0.95,"interpretation":"next Tuesday morning"}' }],
    });

    const result = await service.parseNaturalLanguage('next Tuesday');
    expect(result.date).toBe('2026-05-26T09:00:00Z');
    expect(result.confidence).toBe(0.95);
  });

  it('returns null date on unparseable input', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"date":null,"confidence":0.1,"interpretation":"unclear timing"}' }],
    });

    const result = await service.parseNaturalLanguage('sometime later');
    expect(result.date).toBeNull();
    expect(result.confidence).toBe(0.1);
  });

  it('returns fallback on API error', async () => {
    mockCreate.mockRejectedValue(new Error('API down'));

    const result = await service.parseNaturalLanguage('tomorrow');
    expect(result.date).toBeNull();
    expect(result.confidence).toBe(0);
  });
});
