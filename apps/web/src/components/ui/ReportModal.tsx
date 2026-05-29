import { useState } from 'react';
import { REPORT_REASONS, REPORT_REASON_LABELS } from '@tctm/shared';
import type { ReportReason } from '@tctm/shared';

interface ReportModalProps {
  onSubmit: (reason: string) => void;
  onClose: () => void;
}

export function ReportModal({ onSubmit, onClose }: ReportModalProps) {
  const [selected, setSelected] = useState<ReportReason | null>(null);
  const [otherText, setOtherText] = useState('');

  const canSubmit = selected !== null && (selected !== 'other' || otherText.trim().length > 0);

  const handleSubmit = () => {
    if (!canSubmit) return;
    const reason = selected === 'other' ? `other: ${otherText.trim()}` : selected!;
    onSubmit(reason);
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20 animate-[fadeIn_150ms_ease-out]" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-[var(--color-surface)] rounded-xl shadow-xl w-full max-w-sm border border-[var(--color-border)] animate-[fadeIn_150ms_ease-out]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-5 py-4 border-b border-[var(--color-border)]">
            <h3 className="text-sm font-semibold text-[var(--color-text)]">Report issue</h3>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
              Why is this task incorrect? This helps improve future extractions.
            </p>
          </div>

          <div className="px-3 py-3 space-y-1">
            {REPORT_REASONS.map((reason) => (
              <button
                key={reason}
                onClick={() => setSelected(reason)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-3 transition-colors ${
                  selected === reason
                    ? 'bg-[var(--color-danger-light)] text-[var(--color-danger)] font-medium'
                    : 'text-[var(--color-text)] hover:bg-[var(--color-surface-alt)]'
                }`}
              >
                <span className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                  selected === reason
                    ? 'border-[var(--color-danger)] bg-[var(--color-danger)]'
                    : 'border-[var(--color-border)]'
                }`}>
                  {selected === reason && (
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  )}
                </span>
                {REPORT_REASON_LABELS[reason]}
              </button>
            ))}

            {selected === 'other' && (
              <textarea
                autoFocus
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                placeholder="Describe the issue..."
                rows={3}
                className="w-full mt-2 text-sm text-[var(--color-text)] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 focus:outline-none focus:border-[var(--color-primary)] placeholder-[var(--color-text-muted)] resize-none"
              />
            )}
          </div>

          <div className="px-5 py-4 border-t border-[var(--color-border)] flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 text-sm rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={`flex-1 py-2.5 text-sm rounded-md transition-colors ${
                canSubmit
                  ? 'bg-[var(--color-danger)] text-white hover:opacity-90'
                  : 'bg-[var(--color-surface-alt)] text-[var(--color-text-muted)] cursor-not-allowed'
              }`}
            >
              Report
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
