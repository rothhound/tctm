import { useEffect, useRef, useState } from 'react';
import type { TaskDto } from '@tctm/shared';
import { REPORT_REASONS, REPORT_REASON_LABELS } from '@tctm/shared';
import { IconFlag, IconFlagFilled, stroke } from '../icons/task-panel-icons';
import { HoverTip } from './HoverTip';

export function ReportDropdown({
  task, isReported, isArchived, onReport, onUnreport,
}: {
  task: TaskDto;
  isReported: boolean;
  isArchived: boolean;
  onReport: (reason: string) => void;
  onUnreport: () => void;
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const [otherMode, setOtherMode] = useState(false);
  const [otherText, setOtherText] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const otherInputRef = useRef<HTMLInputElement>(null);

  // Outside-click close
  useEffect(() => {
    if (!showDropdown) return;
    const h = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showDropdown]);

  // Close on scroll/resize
  useEffect(() => {
    if (!showDropdown) return;
    const close = () => setShowDropdown(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [showDropdown]);

  // Reset "Other" mode when dropdown closes
  useEffect(() => {
    if (!showDropdown) {
      setOtherMode(false);
      setOtherText('');
    }
  }, [showDropdown]);

  // Auto-focus other input
  useEffect(() => {
    if (otherMode) {
      const id = window.setTimeout(() => otherInputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [otherMode]);

  if (isArchived) return null;

  const openDropdown = () => {
    if (isReported) { onUnreport(); return; }
    if (showDropdown) { setShowDropdown(false); return; }
    const t = triggerRef.current;
    if (!t) return;
    const rect = t.getBoundingClientRect();
    const APPROX_HEIGHT = 320;
    const DESIRED_WIDTH = 260;
    const MARGIN = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(DESIRED_WIDTH, vw - MARGIN * 2);

    const spaceBelow = vh - rect.bottom - MARGIN;
    const spaceAbove = rect.top - MARGIN;
    const placeAbove = spaceBelow < APPROX_HEIGHT && spaceAbove > spaceBelow;

    const top = placeAbove
      ? Math.max(MARGIN, rect.top - APPROX_HEIGHT - 4)
      : Math.min(rect.bottom + 4, vh - APPROX_HEIGHT - MARGIN);

    let left = rect.right - width;
    if (left + width > vw - MARGIN) left = vw - width - MARGIN;
    if (left < MARGIN) left = MARGIN;

    setCoords({ top, left, width });
    setShowDropdown(true);
  };

  const submitReport = (reason: string) => {
    onReport(reason);
    setShowDropdown(false);
  };

  return (
    <div ref={wrapperRef} className="relative inline-flex">
      <HoverTip label={isReported ? 'Unreport' : 'Report issue'}>
        <button
          ref={triggerRef}
          onClick={openDropdown}
          className={`shrink-0 w-11 h-11 md:w-9 md:h-9 flex items-center justify-center rounded-md transition-colors ${
            isReported
              ? 'text-[#7b56a3] bg-[#f3eef8] hover:bg-[#ebe1f5]'
              : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)]'
          }`}
          aria-label={isReported ? 'Unreport task' : 'Report task'}
          aria-pressed={isReported}
          aria-expanded={showDropdown}
        >
          {isReported ? <IconFlagFilled size={20} /> : <IconFlag size={20} />}
        </button>
      </HoverTip>
      {showDropdown && coords && (
        <div
          role="menu"
          style={{ position: 'fixed', top: coords.top, left: coords.left, width: coords.width }}
          className="z-50 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg py-1 animate-[fadeIn_150ms_ease-out]"
        >
          {!otherMode ? (
            <>
              <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)] px-3 pt-2 pb-1">
                Report reason
              </p>
              {REPORT_REASONS.map((reason) => (
                <button
                  key={reason}
                  role="menuitem"
                  onClick={() => {
                    if (reason === 'other') { setOtherMode(true); return; }
                    submitReport(reason);
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-alt)] transition-colors"
                >
                  {REPORT_REASON_LABELS[reason]}
                </button>
              ))}
            </>
          ) : (
            <div className="px-3 pt-2 pb-3">
              <div className="flex items-center gap-1.5 mb-2">
                <button
                  onClick={() => setOtherMode(false)}
                  className="w-6 h-6 -ml-1 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)] transition-colors"
                  aria-label="Back to reasons"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" {...stroke}><path d="M8.5 3L4.5 7L8.5 11" /></svg>
                </button>
                <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                  Describe the issue
                </p>
              </div>
              <div className="flex gap-1.5">
                <input
                  ref={otherInputRef}
                  value={otherText}
                  onChange={(e) => setOtherText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && otherText.trim()) {
                      submitReport(`other: ${otherText.trim()}`);
                    } else if (e.key === 'Escape') {
                      e.stopPropagation();
                      setShowDropdown(false);
                    }
                  }}
                  placeholder="Custom reason..."
                  className="flex-1 min-w-0 text-base md:text-sm text-[var(--color-text)] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md px-2 py-1.5 focus:outline-none focus:border-[var(--color-primary)] placeholder-[var(--color-text-muted)]"
                />
                <button
                  onClick={() => { if (otherText.trim()) submitReport(`other: ${otherText.trim()}`); }}
                  disabled={!otherText.trim()}
                  className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-md bg-[var(--color-primary)] text-white hover:opacity-90 active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Submit
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
