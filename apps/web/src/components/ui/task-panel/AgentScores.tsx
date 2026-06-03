import type { TaskExtraction } from '@tctm/shared';

const SIGNAL_LABELS: Record<string, string> = {
  explicitness: 'Explicitness',
  actionability: 'Actionability',
  addressedToUser: 'Addressed to you',
  entityMatchConfidence: 'Entity match',
  temporalClarity: 'Temporal clarity',
};

const SIGNAL_KEYS = ['explicitness', 'actionability', 'addressedToUser', 'entityMatchConfidence', 'temporalClarity'] as const;

function scoreColor(v: number): string {
  return v >= 0.7 ? 'var(--color-primary)' : v >= 0.4 ? '#cf8600' : '#e03e3e';
}

/**
 * The agent's extraction scores for a task — confidence, judge verdict, per-signal breakdown,
 * ambiguity flags, models. Hidden by default; revealed by a toggle in the panel.
 */
export function AgentScores({ extraction, signalCount }: { extraction: TaskExtraction; signalCount: number }) {
  const conf = extraction.confidence;
  return (
    <div className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3 space-y-2 text-[var(--color-text-muted)]">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-[var(--color-text)]">Overall confidence</span>
        <span className="text-[11px] font-semibold" style={{ color: scoreColor(conf) }}>{Math.round(conf * 100)}%</span>
      </div>

      {extraction.judge && (
        <p className="text-[11px] leading-relaxed">
          <span className="font-medium text-[var(--color-text)]">Judge:</span> {extraction.judge.verdict} — {extraction.judge.reason}
        </p>
      )}

      {extraction.sourceQuote && (
        <p className="text-[11px] italic leading-relaxed">&ldquo;{extraction.sourceQuote}&rdquo;</p>
      )}

      <div className="space-y-1 pt-1">
        {SIGNAL_KEYS.map((k) => {
          const pct = Math.round((extraction.signals[k] ?? 0) * 100);
          return (
            <div key={k} className="flex items-center gap-2">
              <span className="text-[10px] w-28 shrink-0">{SIGNAL_LABELS[k]}</span>
              <div className="flex-1 h-1 bg-[var(--color-border)] rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: scoreColor(extraction.signals[k] ?? 0) }} />
              </div>
              <span className="text-[10px] w-8 text-right tabular-nums">{pct}%</span>
            </div>
          );
        })}
      </div>

      {extraction.ambiguityFlags.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {extraction.ambiguityFlags.map((f, i) => (
            <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)]">{f}</span>
          ))}
        </div>
      )}

      <div className="text-[9px] pt-1">
        {signalCount} signal{signalCount === 1 ? '' : 's'} · {extraction.extractorModel}
        {extraction.judgeModel ? ` · judge ${extraction.judgeModel}` : ''} · {new Date(extraction.extractedAt).toLocaleDateString()}
      </div>
    </div>
  );
}
