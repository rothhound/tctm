import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { TaskRow } from './TaskRow';
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
    notes: null,
    type: 'review',
    status: 'pending',
    bucket: 'inbox',
    priority: 'high',
    source: 'gmail',
    dueAt: null,
    parentTaskId: null,
    recurrence: null,
    entityIds: [],
    sourceSignalIds: [],
    waitingOnEntityIds: [],
    extraction: null,
    reviewRequired: false,
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
    snoozeUntil: null,
    ...overrides,
  };
}

function renderTaskRow(props: { task: TaskDto } & Partial<React.ComponentProps<typeof TaskRow>>) {
  return render(
    <Provider store={makeStore()}>
      <TaskRow {...props} />
    </Provider>,
  );
}

describe('TaskRow', () => {
  it('renders task title', () => {
    renderTaskRow({ task: mockTask() });
    expect(screen.getByText('Review pitch deck')).toBeInTheDocument();
  });

  it('renders description when present', () => {
    renderTaskRow({ task: mockTask({ description: 'From Acme Corp' }) });
    expect(screen.getByText('From Acme Corp')).toBeInTheDocument();
  });

  it('hides description when null', () => {
    renderTaskRow({ task: mockTask({ description: null }) });
    expect(screen.queryByText('From Acme Corp')).not.toBeInTheDocument();
  });

  it('shows checkbox by default (showCheckbox=true)', () => {
    renderTaskRow({ task: mockTask() });
    expect(screen.getByRole('button', { name: 'Mark complete' })).toBeInTheDocument();
  });

  it('hides checkbox when showCheckbox=false', () => {
    renderTaskRow({ task: mockTask(), showCheckbox: false });
    expect(screen.queryByRole('button', { name: 'Mark complete' })).not.toBeInTheDocument();
  });

  it('shows priority pill for high priority', () => {
    renderTaskRow({ task: mockTask({ priority: 'high' }) });
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('shows priority pill for mid priority', () => {
    renderTaskRow({ task: mockTask({ priority: 'mid' }) });
    expect(screen.getByText('Med')).toBeInTheDocument();
  });

  it('shows priority pill for low priority', () => {
    renderTaskRow({ task: mockTask({ priority: 'low' }) });
    expect(screen.getByText('Low')).toBeInTheDocument();
  });

  it('shows source icon chip', () => {
    renderTaskRow({ task: mockTask({ source: 'gmail' }) });
    expect(screen.getByText('Gmail')).toBeInTheDocument();
  });

  it('calls onSelect when card clicked', async () => {
    const onSelect = vi.fn();
    const task = mockTask();
    renderTaskRow({ task, onSelect });

    await userEvent.setup().click(screen.getByText('Review pitch deck'));
    expect(onSelect).toHaveBeenCalledWith(task);
  });

  it('shows due date chip when dueAt set (read-only, no onDueDateChange)', () => {
    // Use a date far in the future to get a short date label like "Jun 15"
    renderTaskRow({ task: mockTask({ dueAt: '2027-06-15T12:00:00Z' }) });
    expect(screen.getByText('Jun 15')).toBeInTheDocument();
  });

  it('shows recurrence chip when recurrence set', () => {
    renderTaskRow({ task: mockTask({ recurrence: { pattern: 'weekly' } }) });
    expect(screen.getByText('Weekly')).toBeInTheDocument();
  });

  it('done task shows line-through and reduced opacity', () => {
    const { container } = renderTaskRow({
      task: mockTask({ status: 'done', completedAt: '2026-05-28T12:00:00Z' }),
    });
    // The outer card div should have opacity-45
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('opacity-45');
    // The title should have line-through
    const title = screen.getByText('Review pitch deck');
    expect(title.className).toContain('line-through');
  });

  it('highlighted task has green background class', () => {
    const { container } = renderTaskRow({ task: mockTask(), highlighted: true });
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('!bg-[#E6F4DC]');
  });

  it('card is draggable when pending', () => {
    const { container } = renderTaskRow({ task: mockTask({ status: 'pending' }) });
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveAttribute('draggable', 'true');
  });

  it('card is not draggable when done', () => {
    const { container } = renderTaskRow({
      task: mockTask({ status: 'done', completedAt: '2026-05-28T12:00:00Z' }),
    });
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveAttribute('draggable', 'false');
  });
});
