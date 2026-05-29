import { useState } from 'react';
import type { TaskDto } from '@tctm/shared';
import { useCompleteTaskMutation } from '../../store/api';
import { SourceIcon } from './SourceIcon';
import { InlineDatePicker } from './InlineDatePicker';

interface TaskRowProps {
  task: TaskDto;
  showCheckbox?: boolean;
  isSelected?: boolean;
  highlighted?: boolean;
  onSelect?: (task: TaskDto) => void;
  onComplete?: (taskId: string) => void;
  onDueDateChange?: (taskId: string, dueAt: string | null) => void;
}

const PRIORITY_BORDER: Record<string, string> = {
  high: 'border-l-[#E24B4A]',
  mid: 'border-l-[#EF9F27]',
  low: 'border-l-[#97C459]',
  none: '',
};

const PRIORITY_PILL: Record<string, { bg: string; text: string; label: string }> = {
  high: { bg: '#FCEBEB', text: '#C0392B', label: 'High' },
  mid: { bg: '#FAEEDA', text: '#A66B00', label: 'Med' },
  low: { bg: '#E6F4DC', text: '#4F7A2E', label: 'Low' },
};

const SOURCE_LABEL: Record<string, string> = {
  slack: 'Slack',
  gmail: 'Gmail',
  notion: 'Notion',
  granola: 'Granola',
};

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
  today: { bg: '#E6F1FB', text: '#1F6FCF' },
  soon: { bg: '#FAEEDA', text: '#A66B00' },
  normal: { bg: '#f5f2ed', text: '#6b6962' },
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
      style={{
        background: bg,
        color: text,
        padding: '2px 7px',
        borderRadius: 6,
      }}
    >
      {children}
    </span>
  );
}

export function TaskRow({ task, showCheckbox = true, isSelected, highlighted, onSelect, onComplete, onDueDateChange }: TaskRowProps) {
  const [completeTask] = useCompleteTaskMutation();
  const [dragging, setDragging] = useState(false);
  const [completing, setCompleting] = useState<false | 'fill' | 'collapse'>(false);
  const isDone = task.status === 'done';

  const borderCls = PRIORITY_BORDER[task.priority] ?? '';
  const pill = !isDone ? PRIORITY_PILL[task.priority] : undefined;
  const sourceLabel = task.source ? SOURCE_LABEL[task.source] ?? task.source : null;
  const due = task.dueAt ? dueState(task.dueAt) : null;
  const dueChip = due ? DUE_CHIP[due.state] : null;
  const recurrence = task.recurrence
    ? recurrenceLabel(task.recurrence.pattern, task.recurrence.interval)
    : null;

  return (
    <>
      <div
        draggable={!isDone && !completing}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', task.id);
          e.dataTransfer.effectAllowed = 'move';
          setDragging(true);
        }}
        onDragEnd={() => setDragging(false)}
        className={`relative bg-[var(--color-surface)] rounded-lg p-3 border border-[var(--color-border)] ${borderCls ? `border-l-2 ${borderCls}` : ''} cursor-pointer transition-all duration-300 group hover:shadow-sm ${
          isSelected ? 'bg-[#f5f2ed]' : ''
        } ${isDone ? 'opacity-45' : ''} ${dragging ? 'opacity-30' : ''} ${completing === 'collapse' ? 'opacity-0 scale-[0.97] -translate-x-2' : ''} ${highlighted ? '!bg-[#E6F4DC]' : ''}`}
        onClick={() => !completing && onSelect?.(task)}
      >

        {/* Row 1: checkbox + title + priority pill */}
        <div className="flex items-start gap-3">
          {showCheckbox && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (isDone || completing) return;
                setCompleting('fill');
                setTimeout(() => setCompleting('collapse'), 400);
                setTimeout(() => {
                  if (onComplete) {
                    onComplete(task.id);
                  } else {
                    completeTask(task.id);
                  }
                }, 700);
              }}
              aria-label={isDone ? 'Completed' : 'Mark complete'}
              className={`mt-0.5 w-[22px] h-[22px] rounded-full border-2 shrink-0 flex items-center justify-center transition-all duration-300 ${
                completing || isDone
                  ? 'bg-[#1D9E75] border-[#1D9E75] text-white'
                  : 'border-[#d5d0c8] hover:border-[#1D9E75] bg-white'
              } ${completing === 'fill' ? 'scale-110' : ''}`}
            >
              {(completing || isDone) && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2.5 6.2L5 8.5L9.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          )}

          <div className="flex-1 min-w-0">
            <p
              className={`text-[14px] font-medium leading-snug line-clamp-2 ${
                isDone ? 'line-through text-[#999]' : 'text-[#1a1a1a]'
              }`}
            >
              {task.title}
            </p>
            {task.description && !isDone && (
              <p className="text-[12px] text-[#aaa] truncate mt-0.5">
                {task.description.replace(/<[^>]+>/g, '')}
              </p>
            )}
          </div>

          {pill && (
            <span
              className="shrink-0 text-[10px] font-medium leading-none mt-1"
              style={{
                background: pill.bg,
                color: pill.text,
                padding: '3px 7px',
                borderRadius: 999,
              }}
            >
              {pill.label}
            </span>
          )}
        </div>

        {/* Row 2: meta left + due date right */}
        <div className={`flex items-center justify-between mt-1.5 ${showCheckbox ? 'pl-[34px]' : ''}`}>
          <div className="flex flex-wrap items-center" style={{ gap: 5 }}>
            {task.source && (
              <Chip bg="#f5f2ed" text="#6b6962">
                <SourceIcon source={task.source} size={11} />
                {sourceLabel}
              </Chip>
            )}
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
            {!isDone && onDueDateChange ? (
              <InlineDatePicker
                value={task.dueAt}
                onChange={(date) => onDueDateChange(task.id, date)}
              />
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
        </div>

      </div>

    </>
  );
}
