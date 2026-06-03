import { useState } from 'react';
import type { TaskDto, ReportReason } from '@tctm/shared';
import { REPORT_REASON_LABELS } from '@tctm/shared';
import { SourceIcon } from './SourceIcon';
import { InlineDatePicker } from './InlineDatePicker';

export type TaskCardFlavor = 'active' | 'done' | 'snoozed' | 'archived' | 'reported' | 'filtered';

interface TaskCardProps {
  task: TaskDto;
  flavor: TaskCardFlavor;
  isSelected?: boolean;
  onSelect?: (task: TaskDto) => void;

  /** Active flavor: checkbox click handler (mark complete). */
  onComplete?: (taskId: string) => void;
  /** Active flavor: inline due-date change. */
  onDueDateChange?: (taskId: string, dueAt: string | null) => void;

  /** Non-active flavors: primary action button click (label is set by flavor). */
  onAction?: (taskId: string) => void;
}

// ── Style constants ─────────────────────────────────────────────
const PRIORITY_BORDER: Record<string, string> = {
  high: 'border-l-[#E24B4A]',
  mid: 'border-l-[#EF9F27]',
  low: 'border-l-[#97C459]',
  none: 'border-l-[#d5d0c8]',
};

const PRIORITY_PILL: Record<string, { bg: string; text: string; label: string }> = {
  high: { bg: '#FCEBEB', text: '#C0392B', label: 'High' },
  mid: { bg: '#FAEEDA', text: '#A66B00', label: 'Med' },
  low: { bg: '#E6F4DC', text: '#4F7A2E', label: 'Low' },
  none: { bg: '#f5f2ed', text: '#6b6962', label: 'None' },
};

const SOURCE_LABEL: Record<string, string> = {
  slack: 'Slack',
  gmail: 'Gmail',
  notion: 'Notion',
  granola: 'Granola',
};

// ── Flavor config ───────────────────────────────────────────────
interface FlavorConfig {
  actionLabel: string | null;
  actionTone: 'primary' | 'danger';
  draggable: boolean;
  showCheckbox: boolean;
  titleLineThrough: boolean;
  containerOpacity: '' | 'opacity-70' | 'opacity-45';
}

const FLAVORS: Record<TaskCardFlavor, FlavorConfig> = {
  active:   { actionLabel: null,       actionTone: 'primary', draggable: true,  showCheckbox: true,  titleLineThrough: false, containerOpacity: '' },
  done:     { actionLabel: 'Reopen',   actionTone: 'primary', draggable: false, showCheckbox: false, titleLineThrough: true,  containerOpacity: 'opacity-70' },
  snoozed:  { actionLabel: 'Wake up',  actionTone: 'primary', draggable: false, showCheckbox: false, titleLineThrough: false, containerOpacity: '' },
  archived: { actionLabel: 'Restore',  actionTone: 'primary', draggable: false, showCheckbox: false, titleLineThrough: false, containerOpacity: 'opacity-70' },
  reported: { actionLabel: 'Restore',  actionTone: 'primary', draggable: false, showCheckbox: false, titleLineThrough: false, containerOpacity: '' },
  filtered: { actionLabel: 'Restore',  actionTone: 'primary', draggable: false, showCheckbox: false, titleLineThrough: false, containerOpacity: 'opacity-70' },
};

// ── Helpers ─────────────────────────────────────────────────────
type DueState = 'overdue' | 'today' | 'soon' | 'normal';

function dueState(dueAt: string): { state: DueState; label: string } {
  const due = new Date(dueAt);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const dayDiff = Math.round((startOfDue.getTime() - startOfToday.getTime()) / 86_400_000);

  let label: string;
  if (dayDiff === 0) label = 'Today';
  else if (dayDiff === 1) label = 'Tomorrow';
  else if (dayDiff === -1) label = 'Yesterday';
  else if (dayDiff < 0) label = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  else if (dayDiff < 7) label = due.toLocaleDateString('en-US', { weekday: 'short' });
  else label = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  let state: DueState;
  if (dayDiff < 0) state = 'overdue';
  else if (dayDiff === 0) state = 'today';
  else if (dayDiff <= 3) state = 'soon';
  else state = 'normal';

  return { state, label };
}

const DUE_CHIP: Record<DueState, { bg: string; text: string }> = {
  overdue: { bg: '#FCEBEB', text: '#C0392B' },
  today:   { bg: '#E6F1FB', text: '#1F6FCF' },
  soon:    { bg: '#FAEEDA', text: '#A66B00' },
  normal:  { bg: '#f5f2ed', text: '#6b6962' },
};

function recurrenceLabel(pattern: string, interval?: number): string {
  if (pattern === 'daily') return interval && interval > 1 ? `${interval}d` : 'Daily';
  if (pattern === 'weekly') return interval && interval > 1 ? `${interval}w` : 'Weekly';
  if (pattern === 'monthly') return interval && interval > 1 ? `${interval}mo` : 'Monthly';
  return 'Custom';
}

function Chip({ bg, text, children }: { bg: string; text: string; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] leading-none"
      style={{ background: bg, color: text, padding: '2px 7px', borderRadius: 6 }}
    >
      {children}
    </span>
  );
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString() : '';
}

// ── Meta row: flavor-specific bottom content ────────────────────
function MetaRow({ task, flavor, onDueDateChange }: { task: TaskDto; flavor: TaskCardFlavor; onDueDateChange?: (id: string, dueAt: string | null) => void }) {
  const sourceLabel = task.source ? SOURCE_LABEL[task.source] ?? task.source : null;
  const sourceChip = task.source && sourceLabel ? (
    <Chip bg="#f5f2ed" text="#6b6962">
      <SourceIcon source={task.source} size={11} />
      {sourceLabel}
    </Chip>
  ) : null;

  if (flavor === 'active') {
    const recurrence = task.recurrence ? recurrenceLabel(task.recurrence.pattern, task.recurrence.interval) : null;
    const due = task.dueAt ? dueState(task.dueAt) : null;
    const dueChip = due ? DUE_CHIP[due.state] : null;
    return (
      <>
        <div className="flex flex-wrap items-center" style={{ gap: 5 }}>
          {sourceChip}
          {recurrence && (
            <Chip bg="#E1F5EE" text="#1D7A5C">
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 6a4 4 0 016.8-2.8L10 4.5M10 1.5V4.5H7M10 6a4 4 0 01-6.8 2.8L2 7.5M2 10.5V7.5H5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {recurrence}
            </Chip>
          )}
        </div>
        <div className="shrink-0">
          {onDueDateChange ? (
            <InlineDatePicker value={task.dueAt} onChange={(d) => onDueDateChange(task.id, d)} />
          ) : due && dueChip ? (
            <Chip bg={dueChip.bg} text={dueChip.text}>
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="1.5" y="2.5" width="9" height="8" rx="1" />
                <path d="M1.5 5h9M4 1.5v2M8 1.5v2" strokeLinecap="round" />
              </svg>
              {due.label}
            </Chip>
          ) : null}
        </div>
      </>
    );
  }

  if (flavor === 'done') {
    return (
      <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-muted)]">
        {task.source && <SourceIcon source={task.source} size={10} />}
        <span>Completed {formatDate(task.completedAt)}</span>
      </div>
    );
  }

  if (flavor === 'snoozed') {
    const returnsOn = task.reminderAt
      ? new Date(task.reminderAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      : '';
    const daysUntil = task.reminderAt ? Math.ceil((new Date(task.reminderAt).getTime() - Date.now()) / 86_400_000) : 0;
    return (
      <div className="flex items-center gap-2 text-[10px]">
        {task.source && <SourceIcon source={task.source} size={12} />}
        <span className="text-[var(--color-primary)] font-medium">Returns {returnsOn}</span>
        <span className="text-[var(--color-text-muted)]">({daysUntil} {daysUntil === 1 ? 'day' : 'days'})</span>
      </div>
    );
  }

  if (flavor === 'archived') {
    return (
      <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-muted)]">
        {task.source && <SourceIcon source={task.source} size={10} />}
        <span>Archived {formatDate(task.archivedAt)}</span>
      </div>
    );
  }

  // reported
  const reasonLabel = task.reportReason
    ? task.reportReason.startsWith('other: ')
      ? task.reportReason.slice(7)
      : REPORT_REASON_LABELS[task.reportReason as ReportReason] ?? task.reportReason
    : null;
  return (
    <div className="flex items-center gap-2 flex-wrap text-[10px]">
      {task.source && <SourceIcon source={task.source} size={12} />}
      <span className="text-[var(--color-text-muted)]">Reported {formatDate(task.reportedAt)}</span>
      {reasonLabel && (
        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-[var(--color-danger-light)] text-[var(--color-danger)]">
          {reasonLabel}
        </span>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────
export function TaskCard({ task, flavor, isSelected, onSelect, onComplete, onDueDateChange, onAction }: TaskCardProps) {
  const cfg = FLAVORS[flavor];
  const [dragging, setDragging] = useState(false);
  const [completing, setCompleting] = useState<false | 'fill' | 'collapse'>(false);

  const borderCls = PRIORITY_BORDER[task.priority] ?? PRIORITY_BORDER.none;
  const pill = PRIORITY_PILL[task.priority] ?? PRIORITY_PILL.none;
  const titleCls = cfg.titleLineThrough ? 'line-through text-[#999]' : 'text-[#1a1a1a]';

  // Active flavor uses an inline meta row with right-aligned date picker.
  // Non-active flavors put the action button in the right slot of the meta row.
  const isActive = flavor === 'active';

  return (
    <div
      draggable={cfg.draggable && !completing}
      onDragStart={(e) => {
        if (!cfg.draggable) return;
        e.dataTransfer.setData('text/plain', task.id);
        e.dataTransfer.effectAllowed = 'move';
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      onClick={() => !completing && onSelect?.(task)}
      className={`relative bg-[var(--color-surface)] rounded-lg p-3 border border-[var(--color-border)] border-l-2 ${borderCls} cursor-pointer transition-all duration-300 group hover:shadow-sm ${
        isSelected ? '!bg-[#EDE8E0] border-[#d5cfc5]' : ''
      } ${cfg.containerOpacity} ${dragging ? 'opacity-30' : ''} ${completing === 'collapse' ? 'opacity-0 scale-[0.97] -translate-x-2' : ''}`}
    >
      {/* Row 1: checkbox + title + priority pill */}
      <div className="flex items-start gap-3">
        {cfg.showCheckbox && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (completing) return;
              setCompleting('fill');
              setTimeout(() => setCompleting('collapse'), 400);
              setTimeout(() => { onComplete?.(task.id); }, 700);
            }}
            aria-label="Mark complete"
            className={`mt-0.5 w-[22px] h-[22px] rounded-full border-2 shrink-0 flex items-center justify-center transition-all duration-300 ${
              completing
                ? 'bg-[#1D9E75] border-[#1D9E75] text-white'
                : 'border-[#d5d0c8] hover:border-[#1D9E75] bg-white'
            } ${completing === 'fill' ? 'scale-110' : ''}`}
          >
            {completing && (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2.5 6.2L5 8.5L9.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        )}

        <div className="flex-1 min-w-0">
          <p className={`text-[14px] font-medium leading-snug line-clamp-2 ${titleCls}`}>
            {task.title}
          </p>
          {task.description && (
            <p className="text-[12px] text-[#aaa] truncate mt-0.5">
              {task.description.replace(/<[^>]+>/g, '')}
            </p>
          )}
        </div>

        <span
          className="shrink-0 text-[10px] font-medium leading-none mt-1"
          style={{ background: pill.bg, color: pill.text, padding: '3px 7px', borderRadius: 999 }}
        >
          {pill.label}
        </span>
      </div>

      {/* Row 2: meta on left, action / due-picker on right */}
      <div className={`flex items-center justify-between mt-1.5 ${cfg.showCheckbox ? 'pl-[34px]' : ''}`}>
        {isActive ? (
          <MetaRow task={task} flavor={flavor} onDueDateChange={onDueDateChange} />
        ) : (
          <>
            <MetaRow task={task} flavor={flavor} />
            {cfg.actionLabel && (
              <button
                onClick={(e) => { e.stopPropagation(); onAction?.(task.id); }}
                className="text-xs text-[var(--color-primary)] px-2 py-1 shrink-0 min-h-[36px] hover:underline"
              >
                {cfg.actionLabel}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
