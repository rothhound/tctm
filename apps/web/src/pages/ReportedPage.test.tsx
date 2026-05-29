import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { ReportedPage } from './ReportedPage';
import { api } from '../store/api';
import { authSlice } from '../store/authSlice';

vi.mock('../store/api', async () => {
  const actual = await vi.importActual('../store/api');
  return {
    ...actual,
    useGetReportedTasksQuery: vi.fn(),
    useUnreportTaskMutation: vi.fn(),
  };
});

import { useGetReportedTasksQuery, useUnreportTaskMutation } from '../store/api';
const mockedQuery = vi.mocked(useGetReportedTasksQuery);
const mockedMutation = vi.mocked(useUnreportTaskMutation);

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
        <ReportedPage />
      </MemoryRouter>
    </Provider>,
  );
}

describe('ReportedPage', () => {
  beforeEach(() => {
    mockedMutation.mockReturnValue([vi.fn(), {} as any]);
  });

  it('shows loading spinner while loading', () => {
    mockedQuery.mockReturnValue({ data: undefined, isLoading: true } as any);
    const { container } = renderPage();
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders the heading when loaded (no count shown when empty)', () => {
    mockedQuery.mockReturnValue({ data: [], isLoading: false } as any);
    renderPage();
    expect(screen.getByRole('heading', { name: 'Reported' })).toBeInTheDocument();
  });

  it('sets the page title', () => {
    mockedQuery.mockReturnValue({ data: [], isLoading: false } as any);
    renderPage();
    expect(document.title).toBe('TCTM | Reported');
  });

  it('shows empty state when no reported tasks', () => {
    mockedQuery.mockReturnValue({ data: [], isLoading: false } as any);
    renderPage();
    expect(screen.getByText(/No issues reported/)).toBeInTheDocument();
  });

  it('displays the description text', () => {
    mockedQuery.mockReturnValue({ data: [], isLoading: false } as any);
    renderPage();
    expect(screen.getByText(/Items incorrectly captured/)).toBeInTheDocument();
  });

  it('shows updated count when tasks exist', () => {
    mockedQuery.mockReturnValue({
      data: [
        { id: '1', title: 'Bad extraction', reportReason: 'not_actionable', reportedAt: '2026-05-01T00:00:00Z' },
        { id: '2', title: 'Duplicate', reportReason: 'duplicate', reportedAt: '2026-05-02T00:00:00Z' },
      ],
      isLoading: false,
    } as any);
    renderPage();
    expect(screen.getByText('Reported (2)')).toBeInTheDocument();
  });
});
