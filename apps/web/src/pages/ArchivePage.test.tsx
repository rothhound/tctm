import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { ArchivePage } from './ArchivePage';
import { api } from '../store/api';
import { authSlice } from '../store/authSlice';

vi.mock('../store/api', async () => {
  const actual = await vi.importActual('../store/api');
  return {
    ...actual,
    useGetArchivedTasksQuery: vi.fn(),
    useUnarchiveTaskMutation: vi.fn(),
  };
});

import { useGetArchivedTasksQuery, useUnarchiveTaskMutation } from '../store/api';
const mockedQuery = vi.mocked(useGetArchivedTasksQuery);
const mockedMutation = vi.mocked(useUnarchiveTaskMutation);

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
        <ArchivePage />
      </MemoryRouter>
    </Provider>,
  );
}

describe('ArchivePage', () => {
  beforeEach(() => {
    mockedMutation.mockReturnValue([vi.fn(), {} as any]);
  });

  it('shows loading spinner while loading', () => {
    mockedQuery.mockReturnValue({ data: undefined, isLoading: true } as any);
    const { container } = renderPage();
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders the "Archive" heading when loaded', () => {
    mockedQuery.mockReturnValue({ data: [], isLoading: false } as any);
    renderPage();
    expect(screen.getByText('Archive')).toBeInTheDocument();
  });

  it('sets the page title', () => {
    mockedQuery.mockReturnValue({ data: [], isLoading: false } as any);
    renderPage();
    expect(document.title).toBe('TCTM | Archived');
  });

  it('shows empty state when no archived tasks', () => {
    mockedQuery.mockReturnValue({ data: [], isLoading: false } as any);
    renderPage();
    expect(screen.getByText(/Nothing archived yet/)).toBeInTheDocument();
  });

  it('displays the description text', () => {
    mockedQuery.mockReturnValue({ data: [], isLoading: false } as any);
    renderPage();
    expect(screen.getByText(/Tasks you've completed or set aside/)).toBeInTheDocument();
  });

  it('shows count in heading when tasks exist', () => {
    mockedQuery.mockReturnValue({
      data: [
        { id: '1', title: 'Test task', archivedAt: '2026-05-01T00:00:00Z' },
      ],
      isLoading: false,
    } as any);
    renderPage();
    expect(screen.getByText('Archive (1)')).toBeInTheDocument();
  });
});
