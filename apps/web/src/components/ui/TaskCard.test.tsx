import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { TaskCard } from './TaskCard';
import type { TaskCardFlavor } from './TaskCard';
import { api } from '../../store/api';
import { authSlice } from '../../store/authSlice';
import type { TaskDto } from '@tctm/shared';

function makeStore() {
  return configureStore({
    reducer: { [api.reducerPath]: api.reducer, auth: authSlice.reducer },
    middleware: (gDM) => gDM().concat(api.middleware),
  });
}

function mockTask(overrides: Partial<TaskDto> = {}): TaskDto {
  return {
    id: 'task-1',
    title: 'Review pitch deck',
    description: 'From Acme Corp',
    status: 'pending',
    triage: 'keep',
    priority: 'high',
    source: 'gmail',
    dueAt: null,
    parentTaskId: null,
    recurrence: null,
    entityIds: [],
    sourceSignalIds: [],
    waitingOnEntityIds: [],
    extraction: null,
    autoCreated: true,
    dedupHash: null,
    archived: false,
    archivedAt: null,
    reported: false,
    reportedAt: null,
    reportReason: null,
    completedAt: null,
    createdAt: '2026-05-28T00:00:00Z',
    updatedAt: '2026-05-28T00:00:00Z',
    reminderAt: null,
    ...overrides,
  };
}

function renderCard(props: React.ComponentProps<typeof TaskCard>) {
  return render(
    <Provider store={makeStore()}>
      <TaskCard {...props} />
    </Provider>,
  );
}

const FLAVORS: TaskCardFlavor[] = ['active', 'done', 'snoozed', 'archived', 'reported'];

describe('TaskCard — shared behavior across all flavors', () => {
  it.each(FLAVORS)('flavor=%s renders title', (flavor) => {
    renderCard({ task: mockTask(), flavor });
    expect(screen.getByText('Review pitch deck')).toBeInTheDocument();
  });

  it.each(FLAVORS)('flavor=%s renders description when present', (flavor) => {
    renderCard({ task: mockTask({ description: 'From Acme Corp' }), flavor });
    expect(screen.getByText('From Acme Corp')).toBeInTheDocument();
  });

  it.each(FLAVORS)('flavor=%s hides description when null', (flavor) => {
    renderCard({ task: mockTask({ description: null }), flavor });
    expect(screen.queryByText('From Acme Corp')).not.toBeInTheDocument();
  });

  it.each(FLAVORS)('flavor=%s shows priority pill (High)', (flavor) => {
    renderCard({ task: mockTask({ priority: 'high' }), flavor });
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it.each(FLAVORS)('flavor=%s shows priority left-border color (high → red)', (flavor) => {
    const { container } = renderCard({ task: mockTask({ priority: 'high' }), flavor });
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('border-l-[#E24B4A]');
  });

  it.each(FLAVORS)('flavor=%s shows priority left-border color (mid → orange)', (flavor) => {
    const { container } = renderCard({ task: mockTask({ priority: 'mid' }), flavor });
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('border-l-[#EF9F27]');
  });

  it.each(FLAVORS)('flavor=%s shows priority left-border color (low → green)', (flavor) => {
    const { container } = renderCard({ task: mockTask({ priority: 'low' }), flavor });
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('border-l-[#97C459]');
  });

  it.each(FLAVORS)('flavor=%s calls onSelect when card clicked', async () => {
    const onSelect = vi.fn();
    const task = mockTask();
    renderCard({ task, flavor: 'archived', onSelect });
    await userEvent.setup().click(screen.getByText('Review pitch deck'));
    expect(onSelect).toHaveBeenCalledWith(task);
  });

  it.each(FLAVORS)('flavor=%s applies selected styling', (flavor) => {
    const { container } = renderCard({ task: mockTask(), flavor, isSelected: true });
    const card = container.firstChild as HTMLElement;
    expect(card.className).toMatch(/!bg-\[#EDE8E0\]/);
  });
});

describe('TaskCard — active flavor', () => {
  it('renders checkbox', () => {
    renderCard({ task: mockTask(), flavor: 'active' });
    expect(screen.getByRole('button', { name: 'Mark complete' })).toBeInTheDocument();
  });

  it('does not render an action button', () => {
    renderCard({ task: mockTask(), flavor: 'active' });
    expect(screen.queryByRole('button', { name: 'Reopen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Wake up' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument();
  });

  it('is draggable', () => {
    const { container } = renderCard({ task: mockTask(), flavor: 'active' });
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveAttribute('draggable', 'true');
  });

  it('calls onComplete after the checkbox animation', async () => {
    vi.useFakeTimers();
    try {
      const onComplete = vi.fn();
      renderCard({ task: mockTask(), flavor: 'active', onComplete });
      fireEvent.click(screen.getByRole('button', { name: 'Mark complete' }));
      vi.advanceTimersByTime(800);
      expect(onComplete).toHaveBeenCalledWith('task-1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows source chip with label', () => {
    renderCard({ task: mockTask({ source: 'gmail' }), flavor: 'active' });
    expect(screen.getByText('Gmail')).toBeInTheDocument();
  });

  it('shows recurrence chip', () => {
    renderCard({ task: mockTask({ recurrence: { pattern: 'weekly' } }), flavor: 'active' });
    expect(screen.getByText('Weekly')).toBeInTheDocument();
  });

  it('shows due date chip when dueAt set without onDueDateChange', () => {
    renderCard({ task: mockTask({ dueAt: '2027-06-15T12:00:00Z' }), flavor: 'active' });
    expect(screen.getByText('Jun 15')).toBeInTheDocument();
  });

  it('renders the priority as an editable button when onChangePriority is provided', () => {
    renderCard({ task: mockTask({ priority: 'high' }), flavor: 'active', onChangePriority: vi.fn() });
    expect(screen.getByRole('button', { name: 'Change priority' })).toBeInTheDocument();
  });

  it('opens the priority menu and calls onChangePriority on select, not onSelect', async () => {
    const onChangePriority = vi.fn();
    const onSelect = vi.fn();
    renderCard({ task: mockTask({ priority: 'high' }), flavor: 'active', onChangePriority, onSelect });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Change priority' }));
    await user.click(screen.getByText('Low'));
    expect(onChangePriority).toHaveBeenCalledWith('task-1', 'low');
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('TaskCard — isNew affordance', () => {
  it('renders a "New" chip when isNew', () => {
    renderCard({ task: mockTask(), flavor: 'active', isNew: true });
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('does not render a "New" chip by default', () => {
    renderCard({ task: mockTask(), flavor: 'active' });
    expect(screen.queryByText('New')).not.toBeInTheDocument();
  });

  it('applies the highlight ring when isNew', () => {
    const { container } = renderCard({ task: mockTask(), flavor: 'active', isNew: true });
    expect((container.firstChild as HTMLElement).className).toContain('ring-1');
  });
});

describe('TaskCard — done flavor', () => {
  it('renders Reopen action button', () => {
    renderCard({ task: mockTask({ status: 'done', completedAt: '2026-05-28T12:00:00Z' }), flavor: 'done' });
    expect(screen.getByRole('button', { name: 'Reopen' })).toBeInTheDocument();
  });

  it('hides checkbox', () => {
    renderCard({ task: mockTask({ status: 'done' }), flavor: 'done' });
    expect(screen.queryByRole('button', { name: 'Mark complete' })).not.toBeInTheDocument();
  });

  it('applies line-through and reduced opacity', () => {
    const { container } = renderCard({ task: mockTask({ status: 'done', completedAt: '2026-05-28T12:00:00Z' }), flavor: 'done' });
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('opacity-70');
    expect(screen.getByText('Review pitch deck').className).toContain('line-through');
  });

  it('shows Completed date in meta', () => {
    renderCard({ task: mockTask({ status: 'done', completedAt: '2026-05-28T12:00:00Z' }), flavor: 'done' });
    expect(screen.getByText(/Completed/)).toBeInTheDocument();
  });

  it('calls onAction with task id when Reopen clicked, not onSelect', () => {
    const onAction = vi.fn();
    const onSelect = vi.fn();
    renderCard({ task: mockTask({ status: 'done' }), flavor: 'done', onAction, onSelect });
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    expect(onAction).toHaveBeenCalledWith('task-1');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('is not draggable', () => {
    const { container } = renderCard({ task: mockTask({ status: 'done' }), flavor: 'done' });
    expect((container.firstChild as HTMLElement)).toHaveAttribute('draggable', 'false');
  });
});

describe('TaskCard — snoozed flavor', () => {
  it('renders Wake up action button', () => {
    renderCard({ task: mockTask({ reminderAt: '2027-01-01T00:00:00Z' }), flavor: 'snoozed' });
    expect(screen.getByRole('button', { name: 'Wake up' })).toBeInTheDocument();
  });

  it('shows Returns date + days-until in meta', () => {
    renderCard({ task: mockTask({ reminderAt: '2027-01-01T00:00:00Z' }), flavor: 'snoozed' });
    expect(screen.getByText(/Returns/)).toBeInTheDocument();
    expect(screen.getByText(/days/)).toBeInTheDocument();
  });

  it('calls onAction with task id when Wake up clicked', () => {
    const onAction = vi.fn();
    renderCard({ task: mockTask({ reminderAt: '2027-01-01T00:00:00Z' }), flavor: 'snoozed', onAction });
    fireEvent.click(screen.getByRole('button', { name: 'Wake up' }));
    expect(onAction).toHaveBeenCalledWith('task-1');
  });
});

describe('TaskCard — archived flavor', () => {
  it('renders Restore action button', () => {
    renderCard({ task: mockTask({ archived: true, archivedAt: '2026-05-28T00:00:00Z' }), flavor: 'archived' });
    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
  });

  it('applies reduced opacity', () => {
    const { container } = renderCard({ task: mockTask({ archived: true }), flavor: 'archived' });
    expect((container.firstChild as HTMLElement).className).toContain('opacity-70');
  });

  it('shows Archived date in meta', () => {
    renderCard({ task: mockTask({ archived: true, archivedAt: '2026-05-28T00:00:00Z' }), flavor: 'archived' });
    expect(screen.getByText(/Archived/)).toBeInTheDocument();
  });

  it('calls onAction when Restore clicked', () => {
    const onAction = vi.fn();
    renderCard({ task: mockTask(), flavor: 'archived', onAction });
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(onAction).toHaveBeenCalledWith('task-1');
  });
});

describe('TaskCard — reported flavor', () => {
  it('renders Restore action button', () => {
    renderCard({ task: mockTask({ reported: true, reportedAt: '2026-05-28T00:00:00Z' }), flavor: 'reported' });
    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
  });

  it('shows Reported date in meta', () => {
    renderCard({ task: mockTask({ reported: true, reportedAt: '2026-05-28T00:00:00Z' }), flavor: 'reported' });
    expect(screen.getByText(/Reported/)).toBeInTheDocument();
  });

  it('shows reason pill when reportReason is a known reason', () => {
    renderCard({ task: mockTask({ reported: true, reportReason: 'not_a_task' }), flavor: 'reported' });
    expect(screen.getByText('Not a task')).toBeInTheDocument();
  });

  it('shows free-text reason after "other: " prefix', () => {
    renderCard({ task: mockTask({ reported: true, reportReason: 'other: Wrong project' }), flavor: 'reported' });
    expect(screen.getByText('Wrong project')).toBeInTheDocument();
  });

  it('calls onAction when Restore clicked', () => {
    const onAction = vi.fn();
    renderCard({ task: mockTask(), flavor: 'reported', onAction });
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(onAction).toHaveBeenCalledWith('task-1');
  });
});
