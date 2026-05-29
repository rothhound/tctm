import { useMemo, useState } from 'react';
import type { TaskDto, TaskPriority } from '@tctm/shared';
import { FilterDropdown } from '../components/ui/FilterDropdown';
import { SourceIcon } from '../components/ui/SourceIcon';

export type DateRange = 'all' | 'today' | 'week' | 'month';
export type SourceFilter = 'all' | 'gmail' | 'slack' | 'notion' | 'granola';
export type PriorityFilter = 'all' | TaskPriority;

type TaskDateField = 'completedAt' | 'archivedAt' | 'reportedAt' | 'reminderAt' | 'snoozeUntil' | 'createdAt' | 'updatedAt' | 'dueAt';

interface UseTaskFiltersOptions {
  /** Field on TaskDto to compare against the date filter. */
  dateField: TaskDateField;
  /** 'past' = "within the last N", 'future' = "within the next N". Default: 'past'. */
  dateDirection?: 'past' | 'future';
  /** Search input placeholder. */
  searchPlaceholder?: string;
}

interface UseTaskFiltersResult {
  filtered: TaskDto[];
  filterBar: React.ReactNode;
  hasActiveFilters: boolean;
  totalCount: number;
  filteredCount: number;
  activeFilterCount: number;
  clearAll: () => void;
}

const SOURCE_OPTIONS: { value: SourceFilter; label: string }[] = [
  { value: 'all', label: 'All sources' },
  { value: 'gmail', label: 'Gmail' },
  { value: 'slack', label: 'Slack' },
  { value: 'notion', label: 'Notion' },
  { value: 'granola', label: 'Granola' },
];

const PRIORITY_OPTIONS: { value: PriorityFilter; label: string }[] = [
  { value: 'all', label: 'Any priority' },
  { value: 'high', label: 'High' },
  { value: 'mid', label: 'Mid' },
  { value: 'low', label: 'Low' },
  { value: 'none', label: 'None' },
];

function dateOptions(direction: 'past' | 'future'): { value: DateRange; label: string }[] {
  if (direction === 'future') {
    return [
      { value: 'all', label: 'All time' },
      { value: 'today', label: 'Today' },
      { value: 'week', label: 'Next 7 days' },
      { value: 'month', label: 'Next 30 days' },
    ];
  }
  return [
    { value: 'all', label: 'All time' },
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'Last 7 days' },
    { value: 'month', label: 'Last 30 days' },
  ];
}

function inRange(timestamp: number, range: DateRange, direction: 'past' | 'future'): boolean {
  if (range === 'all') return true;
  const now = Date.now();
  if (range === 'today') {
    const d = new Date();
    const startOfToday = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const endOfToday = startOfToday + 86_400_000;
    return timestamp >= startOfToday && timestamp < endOfToday;
  }
  const days = range === 'week' ? 7 : 30;
  const window = days * 86_400_000;
  if (direction === 'future') return timestamp >= now && timestamp <= now + window;
  return timestamp >= now - window && timestamp <= now;
}

export function useTaskFilters(
  tasks: TaskDto[] | undefined,
  options: UseTaskFiltersOptions,
): UseTaskFiltersResult {
  const { dateField, dateDirection = 'past', searchPlaceholder = 'Search by title...' } = options;

  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');

  const filtered = useMemo<TaskDto[]>(() => {
    const all = tasks ?? [];
    const q = search.trim().toLowerCase();
    return all.filter((t) => {
      if (dateRange !== 'all') {
        const raw = t[dateField];
        const ts = raw ? new Date(raw as string).getTime() : 0;
        if (!inRange(ts, dateRange, dateDirection)) return false;
      }
      if (sourceFilter !== 'all' && t.source !== sourceFilter) return false;
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
      if (q && !t.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tasks, dateRange, dateDirection, dateField, sourceFilter, priorityFilter, search]);

  const totalCount = tasks?.length ?? 0;
  const activeFilterCount =
    (dateRange !== 'all' ? 1 : 0) +
    (sourceFilter !== 'all' ? 1 : 0) +
    (priorityFilter !== 'all' ? 1 : 0) +
    (search.trim() !== '' ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0;

  const clearAll = () => {
    setSearch('');
    setDateRange('all');
    setSourceFilter('all');
    setPriorityFilter('all');
  };

  const dateOpts = dateOptions(dateDirection);

  const filterBar = (
    <div className="shrink-0 px-3 md:px-0 pb-2 flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-2 flex-wrap">
        <FilterDropdown<PriorityFilter>
          label="Priority"
          value={priorityFilter}
          defaultValue="all"
          options={PRIORITY_OPTIONS}
          onChange={setPriorityFilter}
        />
        <FilterDropdown<DateRange>
          label="Date"
          value={dateRange}
          defaultValue="all"
          options={dateOpts}
          onChange={setDateRange}
        />
        <FilterDropdown<SourceFilter>
          label="Source"
          value={sourceFilter}
          defaultValue="all"
          options={SOURCE_OPTIONS}
          onChange={setSourceFilter}
          renderOption={(o) => (
            <>
              {o.value !== 'all' && <SourceIcon source={o.value} size={12} />}
              {o.label}
            </>
          )}
        />
        {hasActiveFilters && (
          <button
            onClick={clearAll}
            className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] whitespace-nowrap px-1"
          >
            Clear
          </button>
        )}
      </div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={searchPlaceholder}
        className="ml-auto flex-1 min-w-[180px] max-w-[280px] md:max-w-[390px] px-3 py-1.5 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)] placeholder-[var(--color-text-muted)]"
      />
    </div>
  );

  return {
    filtered,
    filterBar,
    hasActiveFilters,
    totalCount,
    filteredCount: filtered.length,
    activeFilterCount,
    clearAll,
  };
}
