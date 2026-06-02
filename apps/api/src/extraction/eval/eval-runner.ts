import { evalFixtures, type EvalFixture } from './fixtures';
import type { ExtractionResult } from '../types';

export interface EvalResult {
  fixtureId: string;
  expected: EvalFixture['expected'];
  actual: {
    extracted: boolean;
    taskCount: number;
    titles: string[];
    types: string[];
    entityMentions: string[];
  };
  correct: boolean;
}

export interface EvalSummary {
  total: number;
  correct: number;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  results: EvalResult[];
}

/**
 * Run the eval set against an extraction function.
 * The extractFn should be the same logic as ExtractorService.extract but injectable for testing.
 */
export async function runEval(
  extractFn: (signal: EvalFixture['signal']) => Promise<ExtractionResult>,
): Promise<EvalSummary> {
  const results: EvalResult[] = [];

  for (const fixture of evalFixtures) {
    const extraction = await extractFn(fixture.signal);
    const extracted = !extraction.noTask && extraction.tasks.length > 0;
    const entityMentions = extraction.tasks.flatMap(t => (t.entityRefs ?? []).map(e => e.mention));

    // The partner (by name/alias) must be rendered as "you", never an entityRef. Fail if any
    // forbidden mention shows up on a task (substring match both ways, case-insensitive).
    const forbidden = (fixture.expected.forbiddenEntityMentions ?? []).map(s => s.toLowerCase());
    const hasForbiddenMention = forbidden.some(f =>
      entityMentions.some(m => {
        const lower = m.toLowerCase();
        return lower.includes(f) || f.includes(lower);
      }),
    );

    const result: EvalResult = {
      fixtureId: fixture.id,
      expected: fixture.expected,
      actual: {
        extracted,
        taskCount: extraction.tasks.length,
        titles: extraction.tasks.map(t => t.title),
        types: extraction.tasks.map(t => t.type),
        entityMentions,
      },
      correct: extracted === fixture.expected.shouldExtract && !hasForbiddenMention,
    };

    results.push(result);
  }

  const truePositives = results.filter(r => r.expected.shouldExtract && r.actual.extracted).length;
  const falsePositives = results.filter(r => !r.expected.shouldExtract && r.actual.extracted).length;
  const trueNegatives = results.filter(r => !r.expected.shouldExtract && !r.actual.extracted).length;
  const falseNegatives = results.filter(r => r.expected.shouldExtract && !r.actual.extracted).length;

  const precision = truePositives / (truePositives + falsePositives || 1);
  const recall = truePositives / (truePositives + falseNegatives || 1);

  return {
    total: results.length,
    correct: results.filter(r => r.correct).length,
    truePositives,
    falsePositives,
    trueNegatives,
    falseNegatives,
    precision,
    recall,
    results,
  };
}
