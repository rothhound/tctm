import type { TaskDto, RecurrencePattern } from '@tctm/shared';

export type PanelMode = 'active' | 'snoozed' | 'archived' | 'reported';

export function getPanelMode(task: TaskDto): PanelMode {
  if (task.archived) return 'archived';
  if (task.reported) return 'reported';
  if (task.reminderAt && new Date(task.reminderAt) > new Date()) return 'snoozed';
  return 'active';
}

export function toNoonISO(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toISOString();
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function relativeFrom(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  const days = Math.round(ms / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

export function formatRecurrence(r: RecurrencePattern | null): string {
  if (!r) return '';
  return r.pattern.charAt(0).toUpperCase() + r.pattern.slice(1);
}

export function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export const PRIORITY_OPTIONS = [
  { value: 'high', label: 'High', dot: 'var(--color-danger)' },
  { value: 'mid', label: 'Medium', dot: 'var(--color-warning)' },
  { value: 'low', label: 'Low', dot: 'var(--color-success)' },
] as const;

export function priorityMeta(p: string) {
  const found = PRIORITY_OPTIONS.find((o) => o.value === p);
  if (found) return { dot: found.dot, label: found.label };
  return { dot: 'var(--color-text-muted)', label: 'No priority' };
}

export const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
