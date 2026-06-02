/**
 * Decides what `db:seed` should do for one prompt purpose, given the existing versions in the DB
 * and the current code template. Pure (no DB) so it's unit-testable; seed.ts performs the writes.
 *
 * Rules:
 *  - no versions yet                     → insert v1 (active)
 *  - active version matches the template → skip (already up to date)
 *  - active version was hand/calibration-tuned (createdBy !== 'seed') → skip (never clobber tuning)
 *  - otherwise (seed-owned but drifted)  → republish as a new active version (max+1)
 */
export interface PromptVersionRow {
  version: number;
  active: boolean;
  content: string;
  metadata?: unknown;
}

export type PromptSeedPlan =
  | { action: 'insert'; version: 1 }
  | { action: 'skip'; reason: 'up-to-date' | 'tuned' }
  | { action: 'republish'; version: number };

export function planPromptSeed(versions: PromptVersionRow[], templateContent: string): PromptSeedPlan {
  if (versions.length === 0) return { action: 'insert', version: 1 };

  const active = versions.find((v) => v.active);
  if (active?.content === templateContent) return { action: 'skip', reason: 'up-to-date' };

  const createdBy = (active?.metadata as { createdBy?: string } | null | undefined)?.createdBy;
  if (active && createdBy !== 'seed') return { action: 'skip', reason: 'tuned' };

  const nextVersion = Math.max(...versions.map((v) => v.version)) + 1;
  return { action: 'republish', version: nextVersion };
}
