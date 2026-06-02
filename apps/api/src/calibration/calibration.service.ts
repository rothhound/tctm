import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, gte } from 'drizzle-orm';
import { LlmService } from '../shared/llm/llm.service';
import { DB, DbType } from '../db/db.module';
import { extractionFeedback, tasks } from '../db/schema';
import { PromptsService } from '../prompts/prompts.service';

export interface CalibrationReport {
  period: { since: string; until: string };
  totalFeedback: number;
  dismissedAutoCreates: number;
  patterns: string[];
  suggestedChanges: string;
  newPromptVersionId?: string;
}

@Injectable()
export class CalibrationService {
  private readonly logger = new Logger(CalibrationService.name);

  constructor(
    private readonly llm: LlmService,
    @Inject(DB) private readonly db: DbType,
    private readonly promptsService: PromptsService,
  ) {}

  async runCalibration(): Promise<CalibrationReport> {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const until = new Date();

    // Pull last week's feedback
    const feedback = await this.db
      .select()
      .from(extractionFeedback)
      .where(gte(extractionFeedback.createdAt, since))
      .orderBy(desc(extractionFeedback.createdAt))
      .limit(200);

    // Focus on dismissed auto-creates (false positives)
    const dismissedAutoCreates = feedback.filter(
      (f) => f.action === 'dismissed' && f.wasAutoCreated,
    );

    if (feedback.length === 0) {
      return {
        period: { since: since.toISOString(), until: until.toISOString() },
        totalFeedback: 0,
        dismissedAutoCreates: 0,
        patterns: [],
        suggestedChanges: 'No feedback to analyze.',
      };
    }

    // Get the current active extraction prompt
    const currentPrompt = await this.promptsService.getActivePrompt('extract');

    // Send to Opus for analysis
    const sampleSize = Math.min(dismissedAutoCreates.length, 50);
    const sample = dismissedAutoCreates.slice(0, sampleSize);

    const analysisInput = {
      currentPromptVersion: currentPrompt.version,
      totalFeedbackThisWeek: feedback.length,
      dismissedAutoCreates: sample.map((f) => ({
        action: f.action,
        reason: f.reason,
        extractionSnapshot: f.extractionSnapshot,
      })),
      acceptedCount: feedback.filter((f) => f.action === 'accepted').length,
      editedCount: feedback.filter((f) => f.action === 'edited').length,
      dismissedCount: feedback.filter((f) => f.action === 'dismissed').length,
    };

    const completion = await this.llm.complete({
      purpose: 'extract',
      maxTokens: 2000,
      system: `You are a prompt calibration analyst. You review extraction feedback (accept/edit/dismiss actions from a VC partner) and identify patterns in false positives.

Your output is a JSON object:
{
  "patterns": ["pattern 1 description", "pattern 2", ...],
  "suggestedPromptEdits": "Specific, actionable changes to the extraction prompt to reduce false positives without increasing false negatives. Reference the current prompt structure.",
  "suggestedThresholdChanges": "Any threshold adjustments recommended",
  "confidence": 0-1
}

Be specific. "Reduce noise" is useless. "Add rule: skip signals from auto-responder domains" is useful.`,
      user: JSON.stringify(analysisInput, null, 2),
    });

    const text = completion.text;

    let analysis: { patterns: string[]; suggestedPromptEdits: string; confidence: number };
    try {
      const cleaned = text.replace(/```json|```/g, '').trim();
      analysis = JSON.parse(cleaned);
    } catch {
      this.logger.error('Calibration analysis parse failed');
      analysis = { patterns: [], suggestedPromptEdits: text, confidence: 0 };
    }

    // If confidence is high enough, create a new prompt version (inactive)
    let newPromptVersionId: string | undefined;
    if (analysis.confidence >= 0.7 && analysis.suggestedPromptEdits) {
      const newVersion = await this.promptsService.createVersion('extract', currentPrompt.content, {
        createdBy: 'calibration',
        reason: `Weekly calibration: ${analysis.patterns.slice(0, 3).join('; ')}`,
        diff: analysis.suggestedPromptEdits,
      });
      newPromptVersionId = newVersion.id;
      this.logger.log(`Calibration created prompt v${newVersion.version} (inactive) for review`);
    }

    const report: CalibrationReport = {
      period: { since: since.toISOString(), until: until.toISOString() },
      totalFeedback: feedback.length,
      dismissedAutoCreates: dismissedAutoCreates.length,
      patterns: analysis.patterns,
      suggestedChanges: analysis.suggestedPromptEdits,
      newPromptVersionId,
    };

    this.logger.log(
      `Calibration complete: ${feedback.length} feedback, ${dismissedAutoCreates.length} dismissed auto-creates, ${analysis.patterns.length} patterns found`,
    );

    return report;
  }
}
