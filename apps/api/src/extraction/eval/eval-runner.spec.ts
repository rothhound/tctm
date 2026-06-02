import { runEval, type EvalSummary } from './eval-runner';
import { evalFixtures } from './fixtures';
import type { ExtractionResult } from '../types';

/**
 * Eval spec — uses a mock extractor that returns deterministic results
 * matching the labeled expectations. This tests the eval harness itself
 * and validates the fixture format.
 *
 * When connected to the real Anthropic API, replace the mock extractor
 * with the real ExtractorService and set a longer timeout.
 */
describe('Extraction Eval Harness', () => {
  // Mock extractor that returns results matching expectations
  const perfectExtractor = async (signal: typeof evalFixtures[number]['signal']): Promise<ExtractionResult> => {
    const fixture = evalFixtures.find(f => f.signal.body === signal.body);
    if (!fixture) return { tasks: [], noTask: true };

    if (!fixture.expected.shouldExtract) {
      return { tasks: [], noTask: true, noTaskReason: 'Not a task' };
    }

    return {
      tasks: Array.from({ length: fixture.expected.taskCount }, (_, i) => ({
        title: fixture.expected.titles?.[i] ?? `Task from ${signal.source}`,
        description: '',
        type: (fixture.expected.types?.[i] ?? 'do') as any,
        entityRefs: [],
        sourceQuote: signal.body.slice(0, 50),
        signals: {
          explicitness: 0.9,
          actionability: 0.9,
          addressedToUser: 0.9,
          entityMatchConfidence: 0.9,
          temporalClarity: 0.8,
        },
        overallConfidence: 0.9,
        ambiguityFlags: [],
      })),
      noTask: false,
    };
  };

  it('has at least 12 fixtures', () => {
    expect(evalFixtures.length).toBeGreaterThanOrEqual(12);
  });

  it('has both positive and negative cases', () => {
    const positives = evalFixtures.filter(f => f.expected.shouldExtract);
    const negatives = evalFixtures.filter(f => !f.expected.shouldExtract);
    expect(positives.length).toBeGreaterThanOrEqual(5);
    expect(negatives.length).toBeGreaterThanOrEqual(5);
  });

  it('achieves 100% precision and recall with perfect extractor', async () => {
    const summary = await runEval(perfectExtractor);

    expect(summary.precision).toBe(1);
    expect(summary.recall).toBe(1);
    expect(summary.correct).toBe(summary.total);
  });

  it('measures precision and recall correctly with imperfect extractor', async () => {
    // Extractor that always says "has task" — should have 100% recall, low precision
    const alwaysExtract = async (): Promise<ExtractionResult> => ({
      tasks: [{
        title: 'Always task',
        description: '',
        type: 'do',
        entityRefs: [],
        sourceQuote: 'test',
        signals: { explicitness: 0.5, actionability: 0.5, addressedToUser: 0.5, entityMatchConfidence: 0.5, temporalClarity: 0.5 },
        overallConfidence: 0.5,
        ambiguityFlags: [],
      }],
      noTask: false,
    });

    const summary = await runEval(alwaysExtract);

    expect(summary.recall).toBe(1); // catches all positives
    expect(summary.precision).toBeLessThan(1); // but also catches negatives
    expect(summary.falsePositives).toBeGreaterThan(0);
  });

  it('marks a task incorrect when it creates an entityRef for the partner (should be "you")', async () => {
    // Extractor that makes the exact mistake we're guarding against: a self-referential entityRef.
    const selfReferencingExtractor = async (signal: typeof evalFixtures[number]['signal']): Promise<ExtractionResult> => {
      const fixture = evalFixtures.find(f => f.signal.body === signal.body);
      if (!fixture?.expected.shouldExtract) return { tasks: [], noTask: true };
      return {
        tasks: [{
          title: fixture.expected.titles?.[0] ?? 'Task',
          description: '',
          type: 'do',
          entityRefs: [{ mention: 'GF' }], // ← treating the partner alias as a third-party entity
          sourceQuote: signal.body.slice(0, 50),
          signals: { explicitness: 0.9, actionability: 0.9, addressedToUser: 0.9, entityMatchConfidence: 0.9, temporalClarity: 0.8 },
          overallConfidence: 0.9,
          ambiguityFlags: [],
        }],
        noTask: false,
      };
    };

    const summary = await runEval(selfReferencingExtractor);
    const named = summary.results.find(r => r.fixtureId === 'slack-capture-named-self');

    expect(named).toBeDefined();
    expect(named!.correct).toBe(false); // 'GF' is a forbidden self-mention for this fixture
  });

  it('measures false negatives with never-extract extractor', async () => {
    const neverExtract = async (): Promise<ExtractionResult> => ({
      tasks: [],
      noTask: true,
    });

    const summary = await runEval(neverExtract);

    expect(summary.recall).toBe(0);
    expect(summary.falseNegatives).toBeGreaterThan(0);
    expect(summary.falsePositives).toBe(0);
  });

  // Threshold test — fails CI if real extraction drops below quality bar
  // Uncomment when connected to real Anthropic API:
  // it('real extraction meets quality bar (precision >= 90%, recall >= 80%)', async () => {
  //   const summary = await runEval(realExtractor);
  //   expect(summary.precision).toBeGreaterThanOrEqual(0.9);
  //   expect(summary.recall).toBeGreaterThanOrEqual(0.8);
  // }, 120_000);
});
