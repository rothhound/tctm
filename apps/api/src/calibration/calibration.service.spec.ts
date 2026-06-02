import { Test, TestingModule } from '@nestjs/testing';
import { CalibrationService } from './calibration.service';
import { PromptsService } from '../prompts/prompts.service';
import { LlmService } from '../shared/llm/llm.service';
import { DB } from '../db/db.module';

function completion(text: string) {
  return {
    text,
    provider: 'anthropic' as const,
    model: 'claude-opus-4-7',
    usage: { inputTokens: 800, outputTokens: 300, cacheReadTokens: 0, cacheCreationTokens: 0 },
    costUsd: 0,
  };
}

describe('CalibrationService', () => {
  let service: CalibrationService;
  let mockComplete: jest.Mock;
  let mockPromptsService: Partial<PromptsService>;

  beforeEach(async () => {
    mockComplete = jest.fn().mockResolvedValue(
      completion(
        JSON.stringify({
          patterns: ['Newsletter-style emails being extracted as tasks'],
          suggestedPromptEdits: 'Add rule: skip signals with newsletter-like subject patterns',
          confidence: 0.85,
        }),
      ),
    );

    mockPromptsService = {
      getActivePrompt: jest.fn().mockResolvedValue({
        id: 'pv-001', purpose: 'extract', version: 1,
        content: 'You are a task extraction assistant...', active: true,
      }),
      createVersion: jest.fn().mockResolvedValue({
        id: 'pv-002', purpose: 'extract', version: 2, active: false,
      }),
    };

    const mockDb: any = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([
                { action: 'dismissed', wasAutoCreated: true, reason: 'Newsletter', extractionSnapshot: {}, createdAt: new Date() },
                { action: 'accepted', wasAutoCreated: true, extractionSnapshot: {}, createdAt: new Date() },
              ]),
            }),
          }),
        }),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalibrationService,
        { provide: LlmService, useValue: { complete: mockComplete, modelFor: jest.fn().mockReturnValue('claude-opus-4-7') } },
        { provide: DB, useValue: mockDb },
        { provide: PromptsService, useValue: mockPromptsService },
      ],
    }).compile();

    service = module.get<CalibrationService>(CalibrationService);
  });

  it('analyzes feedback and returns a calibration report', async () => {
    const report = await service.runCalibration();

    expect(report.totalFeedback).toBe(2);
    expect(report.dismissedAutoCreates).toBe(1);
    expect(report.patterns).toContain('Newsletter-style emails being extracted as tasks');
    expect(report.suggestedChanges).toContain('newsletter');
  });

  it('creates a new prompt version when confidence is high', async () => {
    const report = await service.runCalibration();

    expect(report.newPromptVersionId).toBe('pv-002');
    expect(mockPromptsService.createVersion).toHaveBeenCalledWith(
      'extract',
      expect.any(String),
      expect.objectContaining({ createdBy: 'calibration' }),
    );
  });

  it('does not create prompt version when confidence is low', async () => {
    mockComplete.mockResolvedValue(
      completion(JSON.stringify({ patterns: [], suggestedPromptEdits: 'unclear', confidence: 0.3 })),
    );

    const report = await service.runCalibration();
    expect(report.newPromptVersionId).toBeUndefined();
    expect(mockPromptsService.createVersion).not.toHaveBeenCalled();
  });

  it('handles empty feedback gracefully', async () => {
    // Override DB to return empty feedback
    const emptyDb: any = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }),
    };

    const module = await Test.createTestingModule({
      providers: [
        CalibrationService,
        { provide: LlmService, useValue: { complete: mockComplete, modelFor: jest.fn().mockReturnValue('claude-opus-4-7') } },
        { provide: DB, useValue: emptyDb },
        { provide: PromptsService, useValue: mockPromptsService },
      ],
    }).compile();

    const svc = module.get<CalibrationService>(CalibrationService);
    const report = await svc.runCalibration();

    expect(report.totalFeedback).toBe(0);
    expect(report.suggestedChanges).toContain('No feedback');
    expect(mockComplete).not.toHaveBeenCalled();
  });
});
