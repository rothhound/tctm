import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../shared/llm/llm.service';

export interface SnoozeParseResult {
  date: string | null;
  confidence: number;
  interpretation: string;
}

@Injectable()
export class SnoozeService {
  private readonly logger = new Logger(SnoozeService.name);

  constructor(private readonly llm: LlmService) {}

  async parseNaturalLanguage(text: string): Promise<SnoozeParseResult> {
    const now = new Date();

    try {
      const completion = await this.llm.complete({
        purpose: 'classify',
        label: 'snooze',
        maxTokens: 200,
        system: `You parse natural language time expressions into ISO 8601 dates. The current date/time is ${now.toISOString()}. Respond with ONLY valid JSON: {"date": "ISO8601 string or null", "confidence": 0-1, "interpretation": "what you understood"}`,
        user: text,
      });

      const cleaned = completion.text.replace(/```json|```/g, '').trim();
      const result = JSON.parse(cleaned);

      return {
        date: result.date ?? null,
        confidence: typeof result.confidence === 'number' ? result.confidence : 0,
        interpretation: result.interpretation ?? text,
      };
    } catch (err: any) {
      this.logger.error(`Snooze parse failed: ${err.message}`);
      return { date: null, confidence: 0, interpretation: text };
    }
  }
}
