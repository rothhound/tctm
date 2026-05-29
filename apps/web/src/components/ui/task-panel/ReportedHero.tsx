import { useState } from 'react';
import type { TaskExtraction } from '@tctm/shared';
import { REPORT_REASON_LABELS } from '@tctm/shared';
import type { ReportReason } from '@tctm/shared';
import { IconChevronDown } from '../icons/task-panel-icons';

function ConfidenceRing({ value }: { value: number }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const dash = c * Math.max(0, Math.min(1, value));
  const color = value >= 0.7 ? '#0f7b6c' : value >= 0.4 ? '#cf8600' : '#e03e3e';
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" className="shrink-0">
      <circle cx="20" cy="20" r={r} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="3" />
      <circle
        cx="20" cy="20" r={r} fill="none" stroke={color} strokeWidth="3"
        strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
        transform="rotate(-90 20 20)"
        style={{ transition: 'stroke-dasharray 700ms ease' }}
      />
      <text x="20" y="23" textAnchor="middle" fontSize="11" fontWeight={600} fill={color}>
        {Math.round(value * 100)}
      </text>
    </svg>
  );
}

function confidenceLabel(value: number): string {
  if (value >= 0.7) return 'High confidence';
  if (value >= 0.4) return 'Medium confidence';
  return 'Low confidence';
}

export function ReportedHero({ extraction, reportReason, signalCount }: { extraction: TaskExtraction; reportReason?: string | null; signalCount: number }) {
  const [expanded, setExpanded] = useState(false);
  const reasonLabel = reportReason
    ? reportReason.startsWith('other: ')
      ? reportReason.slice(7)
      : REPORT_REASON_LABELS[reportReason as ReportReason] ?? reportReason
    : null;
  const conf = extraction.confidence;
  const labelColor = conf >= 0.7 ? '#0f7b6c' : conf >= 0.4 ? '#cf8600' : '#e03e3e';

  return (
    <div className="rounded-xl border border-[#d8c8e8] bg-gradient-to-br from-[#f6eefb] to-[#ede1f6] p-4">
      <div className="flex items-start gap-3">
        <ConfidenceRing value={conf} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: labelColor }}>{confidenceLabel(conf)}</p>
          {extraction.judge && (
            <p className="text-[11px] text-[#5a3d75] mt-0.5">
              <span className="font-medium">Judge:</span> {extraction.judge.verdict} — {extraction.judge.reason}
            </p>
          )}
        </div>
        <button
          onClick={() => setExpanded((e) => !e)}
          className="w-9 h-9 flex items-center justify-center rounded-md text-[#7b56a3] hover:bg-white/50 transition-colors"
          aria-label={expanded ? 'Collapse audit' : 'Expand audit'}
        >
          <span className={`transition-transform ${expanded ? 'rotate-180' : ''}`}><IconChevronDown size={18} /></span>
        </button>
      </div>

      {extraction.sourceQuote && (
        <p className="mt-3 text-[12px] italic text-[#3f2858] leading-relaxed">
          &ldquo;{extraction.sourceQuote}&rdquo;
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {reasonLabel && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/70 text-[#7b56a3]">
            {reasonLabel}
          </span>
        )}
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/70 text-[#7b56a3]">
          {signalCount} signal{signalCount === 1 ? '' : 's'}
        </span>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-[#d8c8e8] space-y-1.5">
          {(['explicitness', 'actionability', 'addressedToUser', 'entityMatchConfidence', 'temporalClarity'] as const).map((k) => {
            const v = extraction.signals[k];
            const pct = Math.round(v * 100);
            const labels: Record<string, string> = {
              explicitness: 'Explicitness',
              actionability: 'Actionability',
              addressedToUser: 'Addressed to user',
              entityMatchConfidence: 'Entity match',
              temporalClarity: 'Temporal clarity',
            };
            return (
              <div key={k} className="flex items-center gap-2">
                <span className="text-[10px] text-[#7b56a3] w-28 shrink-0">{labels[k]}</span>
                <div className="flex-1 h-1 bg-white/60 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: labelColor }} />
                </div>
                <span className="text-[10px] text-[#7b56a3] w-8 text-right">{pct}%</span>
              </div>
            );
          })}
          {extraction.ambiguityFlags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {extraction.ambiguityFlags.map((f, i) => (
                <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/70 text-[#7b56a3]">{f}</span>
              ))}
            </div>
          )}
          <div className="text-[9px] text-[#9477b8] pt-1">
            Extractor: {extraction.extractorModel}{extraction.judgeModel ? ` · Judge: ${extraction.judgeModel}` : ''} · {new Date(extraction.extractedAt).toLocaleDateString()}
          </div>
        </div>
      )}
    </div>
  );
}
