import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderHook, act } from '@testing-library/react';
import { ViewToggle, useViewMode } from './ViewToggle';

describe('ViewToggle', () => {
  it('renders both list and kanban buttons', () => {
    render(<ViewToggle mode="list" onChange={() => {}} />);

    expect(screen.getByTitle('List view')).toBeInTheDocument();
    expect(screen.getByTitle('Kanban view')).toBeInTheDocument();
  });

  it('calls onChange with "kanban" when kanban button is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<ViewToggle mode="list" onChange={onChange} />);

    await user.click(screen.getByTitle('Kanban view'));

    expect(onChange).toHaveBeenCalledWith('kanban');
  });

  it('calls onChange with "list" when list button is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<ViewToggle mode="kanban" onChange={onChange} />);

    await user.click(screen.getByTitle('List view'));

    expect(onChange).toHaveBeenCalledWith('list');
  });

  it('highlights the active mode button', () => {
    const { rerender } = render(<ViewToggle mode="list" onChange={() => {}} />);

    const listButton = screen.getByTitle('List view');
    const kanbanButton = screen.getByTitle('Kanban view');

    // When mode is 'list', list button has the active class, kanban does not
    expect(listButton.className).toContain('shadow-sm');
    expect(kanbanButton.className).not.toContain('shadow-sm');

    // Switch to kanban mode
    rerender(<ViewToggle mode="kanban" onChange={() => {}} />);

    expect(screen.getByTitle('Kanban view').className).toContain('shadow-sm');
    expect(screen.getByTitle('List view').className).not.toContain('shadow-sm');
  });
});

describe('useViewMode', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to "list" when localStorage is empty', () => {
    const { result } = renderHook(() => useViewMode());

    expect(result.current[0]).toBe('list');
  });

  it('reads initial mode from localStorage', () => {
    localStorage.setItem('tctm-view-mode', 'kanban');

    const { result } = renderHook(() => useViewMode());

    expect(result.current[0]).toBe('kanban');
  });

  it('persists mode to localStorage on change', () => {
    const { result } = renderHook(() => useViewMode());

    act(() => {
      result.current[1]('kanban');
    });

    expect(result.current[0]).toBe('kanban');
    expect(localStorage.getItem('tctm-view-mode')).toBe('kanban');
  });
});
