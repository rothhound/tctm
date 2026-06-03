import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { FilteredPage } from './FilteredPage';
import { api } from '../store/api';
import { authSlice } from '../store/authSlice';

vi.mock('../store/api', async () => {
  const actual = await vi.importActual('../store/api');
  return {
    ...actual,
    useGetFilteredTasksQuery: vi.fn(),
    useRestoreTaskMutation: vi.fn(),
  };
});

// Stub the detail panel so the deep-link test targets routing, not TaskPanel's data hooks.
vi.mock('../components/ui/TaskPanel', () => ({
  TaskPanel: ({ taskId }: { taskId: string }) => <div data-testid="task-panel">panel:{taskId}</div>,
}));

import { useGetFilteredTasksQuery, useRestoreTaskMutation } from '../store/api';
const mockedQuery = vi.mocked(useGetFilteredTasksQuery);
const mockedMutation = vi.mocked(useRestoreTaskMutation);

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
        <FilteredPage />
      </MemoryRouter>
    </Provider>,
  );
}

function renderPageAt(path: string) {
  return render(
    <Provider store={makeStore()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/filtered" element={<FilteredPage />} />
          <Route path="/filtered/:taskId" element={<FilteredPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

describe('FilteredPage', () => {
  beforeEach(() => {
    mockedMutation.mockReturnValue([vi.fn(), {} as any]);
  });

  it('shows loading spinner while loading', () => {
    mockedQuery.mockReturnValue({ data: undefined, isLoading: true } as any);
    const { container } = renderPage();
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders the "Filtered" heading when loaded', () => {
    mockedQuery.mockReturnValue({ data: [], isLoading: false } as any);
    renderPage();
    expect(screen.getByText('Filtered')).toBeInTheDocument();
  });

  it('sets the page title', () => {
    mockedQuery.mockReturnValue({ data: [], isLoading: false } as any);
    renderPage();
    expect(document.title).toBe('TCTM | Filtered');
  });

  it('shows empty state when nothing filtered', () => {
    mockedQuery.mockReturnValue({ data: [], isLoading: false } as any);
    renderPage();
    expect(screen.getByText(/Nothing filtered out yet/)).toBeInTheDocument();
  });

  it('displays the description text', () => {
    mockedQuery.mockReturnValue({ data: [], isLoading: false } as any);
    renderPage();
    expect(screen.getByText(/auto-dismissed as noise/)).toBeInTheDocument();
  });

  it('shows count in heading when tasks exist', () => {
    mockedQuery.mockReturnValue({
      data: [{ id: '1', title: 'Filtered task', triage: 'dismissed', createdAt: '2026-05-01T00:00:00Z' }],
      isLoading: false,
    } as any);
    renderPage();
    expect(screen.getByText('Filtered (1)')).toBeInTheDocument();
  });

  it('opens the task panel when a taskId is in the URL (deep link)', () => {
    mockedQuery.mockReturnValue({ data: [], isLoading: false } as any);
    renderPageAt('/filtered/task-123');
    expect(screen.getByTestId('task-panel')).toHaveTextContent('panel:task-123');
  });

  it('does not open the task panel on the bare list URL', () => {
    mockedQuery.mockReturnValue({ data: [], isLoading: false } as any);
    renderPageAt('/filtered');
    expect(screen.queryByTestId('task-panel')).not.toBeInTheDocument();
  });
});
