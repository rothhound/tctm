import type { ReactNode } from 'react';
import { HoverTip } from './HoverTip';

export function ActionChip({
  icon, label, onClick, highlighted, disabled, tooltip,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  highlighted?: boolean;
  disabled?: boolean;
  tooltip?: string;
}) {
  const inner = (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed ${
        highlighted
          ? 'bg-[#f3eef8] text-[#7b56a3] hover:bg-[#ebe1f5]'
          : 'bg-[var(--color-surface-alt)] text-[var(--color-text)] hover:bg-[var(--color-border)]'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
  return tooltip ? <HoverTip label={tooltip}>{inner}</HoverTip> : inner;
}
