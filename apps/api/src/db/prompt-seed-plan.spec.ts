import { planPromptSeed, PromptVersionRow } from './prompt-seed-plan';

const v = (version: number, active: boolean, content: string, createdBy = 'seed'): PromptVersionRow => ({
  version,
  active,
  content,
  metadata: { createdBy },
});

describe('planPromptSeed', () => {
  it('inserts v1 when no versions exist yet', () => {
    expect(planPromptSeed([], 'TEMPLATE')).toEqual({ action: 'insert', version: 1 });
  });

  it('skips when the active version already matches the template', () => {
    expect(planPromptSeed([v(1, true, 'TEMPLATE')], 'TEMPLATE')).toEqual({ action: 'skip', reason: 'up-to-date' });
  });

  it('republishes a drifted, seed-owned prompt at the next version number', () => {
    const versions = [v(1, false, 'OLD'), v(2, true, 'CURRENT-ACTIVE')];
    expect(planPromptSeed(versions, 'NEW')).toEqual({ action: 'republish', version: 3 });
  });

  it('never clobbers a hand/calibration-tuned active prompt', () => {
    const versions = [v(1, false, 'seed-v1'), v(2, true, 'tuned', 'calibration')];
    expect(planPromptSeed(versions, 'NEW')).toEqual({ action: 'skip', reason: 'tuned' });
  });

  it('republishes (recovers) when versions exist but none is active', () => {
    expect(planPromptSeed([v(1, false, 'OLD')], 'NEW')).toEqual({ action: 'republish', version: 2 });
  });
});
