import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { ActivePage } from './ActivePage';
import { api } from '../store/api';
import { authSlice } from '../store/authSlice';

// Mock useAllTasks — returns loading state by default
vi.mock('../hooks/useAllTasks', () => ({
  useAllTasks: vi.fn(),
}));

// Stub the detail panel so the deep-link test targets routing, not TaskPanel's data hooks.
vi.mock('../components/ui/TaskPanel', () => ({
  TaskPanel: ({ taskId }: { taskId: string }) => <div data-testid="task-panel">panel:{taskId}</div>,
}));

import { useAllTasks } from '../hooks/useAllTasks';
const mockedUseAllTasks = vi.mocked(useAllTasks);

function makeStore() {
  return configureStore({
    reducer: { [api.reducerPath]: api.reducer, auth: authSlice.reducer },
    middleware: (gDM) => gDM().concat(api.middleware),
  });
}

function renderPage() {
  return render(
    <Provider store={makeStore()}>
      <MemoryRouter>
        <ActivePage />
      </MemoryRouter>
    </Provider>,
  );
}

function renderPageAt(path: string) {
  return render(
    <Provider store={makeStore()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/active" element={<ActivePage />} />
          <Route path="/active/:taskId" element={<ActivePage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

describe('ActivePage', () => {
  beforeEach(() => {
    mockedUseAllTasks.mockReturnValue({
      tasks: [],
      isLoading: true,
      hasMore: false,
      loadMore: vi.fn(),
      total: 0,
      updateTaskLocally: vi.fn(),
      removeTaskLocally: vi.fn(),
    });
  });

  it('renders the "Active" heading', () => {
    renderPage();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows loading spinner when data is loading', () => {
    const { container } = renderPage();
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders the ViewToggle buttons', () => {
    renderPage();
    expect(screen.getByTitle('List view')).toBeInTheDocument();
    expect(screen.getByTitle('Kanban view')).toBeInTheDocument();
  });

  it('sets the page title', () => {
    renderPage();
    expect(document.title).toBe('TCTM | Active');
  });

  it('shows empty state when loaded with no tasks', () => {
    mockedUseAllTasks.mockReturnValue({
      tasks: [],
      isLoading: false,
      hasMore: false,
      loadMore: vi.fn(),
      total: 0,
      updateTaskLocally: vi.fn(),
      removeTaskLocally: vi.fn(),
    });

    renderPage();
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument();
  });

  it('opens the task panel when a taskId is in the URL (deep link)', () => {
    renderPageAt('/active/task-123');
    expect(screen.getByTestId('task-panel')).toHaveTextContent('panel:task-123');
  });

  it('does not open the task panel on the bare list URL', () => {
    renderPageAt('/active');
    expect(screen.queryByTestId('task-panel')).not.toBeInTheDocument();
  });
});
