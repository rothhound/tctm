import { Test, TestingModule } from '@nestjs/testing';
import { SnoozeController } from './snooze.controller';
import { SnoozeService } from './snooze.service';

describe('SnoozeController', () => {
  let controller: SnoozeController;
  let snoozeService: Partial<SnoozeService>;

  const mockParseResult = {
    date: '2026-06-01T09:00:00.000Z',
    confidence: 0.95,
    interpretation: 'next Monday at 9am',
  };

  beforeEach(async () => {
    snoozeService = {
      parseNaturalLanguage: jest.fn().mockResolvedValue(mockParseResult),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SnoozeController],
      providers: [{ provide: SnoozeService, useValue: snoozeService }],
    }).compile();

    controller = module.get<SnoozeController>(SnoozeController);
  });

  describe('parse()', () => {
    it('delegates to snoozeService.parseNaturalLanguage', async () => {
      const result = await controller.parse({ text: 'next Monday at 9am' });
      expect(snoozeService.parseNaturalLanguage).toHaveBeenCalledWith('next Monday at 9am');
      expect(result).toEqual(mockParseResult);
    });

    it('passes the exact text string to the service', async () => {
      await controller.parse({ text: 'in 3 hours' });
      expect(snoozeService.parseNaturalLanguage).toHaveBeenCalledWith('in 3 hours');
    });

    it('returns null date when service cannot parse', async () => {
      const nullResult = { date: null, confidence: 0, interpretation: 'gibberish' };
      (snoozeService.parseNaturalLanguage as jest.Mock).mockResolvedValue(nullResult);

      const result = await controller.parse({ text: 'gibberish' });
      expect(result).toEqual(nullResult);
    });
  });
});
