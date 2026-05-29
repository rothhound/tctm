import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { ActivePage } from './ActivePage';
import { api } from '../store/api';
import { authSlice } from '../store/authSlice';

// Mock useAllTasks — returns loading state by default
vi.mock('../hooks/useAllTasks', () => ({
  useAllTasks: vi.fn(),
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
});
