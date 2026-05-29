import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { SnoozedPage } from './SnoozedPage';
import { api } from '../store/api';
import { authSlice } from '../store/authSlice';

vi.mock('../store/api', async () => {
  const actual = await vi.importActual('../store/api');
  return {
    ...actual,
    useGetSnoozedTasksQuery: vi.fn(),
    useClearReminderMutation: vi.fn(),
  };
});

import { useGetSnoozedTasksQuery, useClearReminderMutation } from '../store/api';
const mockedQuery = vi.mocked(useGetSnoozedTasksQuery);
const mockedMutation = vi.mocked(useClearReminderMutation);

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
        <SnoozedPage />
      </MemoryRouter>
    </Provider>,
  );
}

describe('SnoozedPage', () => {
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
    expect(screen.getByRole('heading', { name: 'Snoozed' })).toBeInTheDocument();
  });

  it('sets the page title', () => {
    mockedQuery.mockReturnValue({ data: [], isLoading: false } as any);
    renderPage();
    expect(document.title).toBe('TCTM | Snoozed');
  });

  it('shows empty state when no snoozed tasks', () => {
    mockedQuery.mockReturnValue({ data: [], isLoading: false } as any);
    renderPage();
    expect(screen.getByText(/No snoozed tasks/)).toBeInTheDocument();
  });

  it('displays the description text', () => {
    mockedQuery.mockReturnValue({ data: [], isLoading: false } as any);
    renderPage();
    expect(screen.getByText(/Tasks hidden until their reminder date/)).toBeInTheDocument();
  });

  it('shows updated count when tasks exist', () => {
    mockedQuery.mockReturnValue({
      data: [
        { id: '1', title: 'Follow up', reminderAt: '2026-06-15T00:00:00Z', source: 'gmail' },
      ],
      isLoading: false,
    } as any);
    renderPage();
    expect(screen.getByText('Snoozed (1)')).toBeInTheDocument();
  });
});
