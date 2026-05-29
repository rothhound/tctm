import { Inject, Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC, MODELS } from '../shared/anthropic.module';

export interface SnoozeParseResult {
  date: string | null;
  confidence: number;
  interpretation: string;
}

@Injectable()
export class SnoozeService {
  private readonly logger = new Logger(SnoozeService.name);

  constructor(@Inject(ANTHROPIC) private readonly anthropic: Anthropic) {}

  async parseNaturalLanguage(text: string): Promise<SnoozeParseResult> {
    const now = new Date();

    try {
      const response = await this.anthropic.messages.create({
        model: MODELS.CLASSIFIER,
        max_tokens: 200,
        system: [
          {
            type: 'text',
            text: `You parse natural language time expressions into ISO 8601 dates. The current date/time is ${now.toISOString()}. Respond with ONLY valid JSON: {"date": "ISO8601 string or null", "confidence": 0-1, "interpretation": "what you understood"}`,
          },
        ],
        messages: [{ role: 'user', content: text }],
      });

      const output = response.content.find((b) => b.type === 'text')?.type === 'text'
        ? (response.content.find((b) => b.type === 'text') as Anthropic.TextBlock).text
        : '';
      const cleaned = output.replace(/```json|```/g, '').trim();
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
