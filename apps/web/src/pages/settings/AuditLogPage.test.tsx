import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { AuditLogPage } from './AuditLogPage';
import { api } from '../../store/api';
import { authSlice } from '../../store/authSlice';

vi.mock('../../store/api', async () => {
  const actual = await vi.importActual('../../store/api');
  return {
    ...actual,
    useGetAuditLogQuery: vi.fn(),
  };
});

import { useGetAuditLogQuery } from '../../store/api';
const mockedQuery = vi.mocked(useGetAuditLogQuery);

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
        <AuditLogPage />
      </MemoryRouter>
    </Provider>,
  );
}

describe('AuditLogPage', () => {
  it('shows empty state when no entries', () => {
    mockedQuery.mockReturnValue({ data: [], isLoading: false } as any);
    renderPage();
    expect(screen.getByText(/No activity yet/)).toBeInTheDocument();
  });

  it('renders audit log entries', () => {
    mockedQuery.mockReturnValue({
      data: [
        { id: 'a1', purpose: 'extract', model: 'claude-opus-4-7', inputTokens: 500, outputTokens: 200, costUsd: 0.05, latencyMs: 1200, createdAt: '2026-05-19T10:00:00Z' },
      ],
      isLoading: false,
    } as any);

    renderPage();
    expect(screen.getByText('extract')).toBeInTheDocument();
    expect(screen.getByText(/claude-opus-4-7/)).toBeInTheDocument();
    expect(screen.getByText(/500 in/)).toBeInTheDocument();
  });

  it('shows the purpose filter dropdown with its options', async () => {
    mockedQuery.mockReturnValue({ data: [], isLoading: false } as any);
    renderPage();
    const trigger = screen.getByRole('button', { name: /Purpose/ });
    expect(trigger).toBeInTheDocument();
    await userEvent.click(trigger);
    expect(screen.getByText('Extract')).toBeInTheDocument();
    expect(screen.getByText('Judge')).toBeInTheDocument();
  });

  it('shows loading spinner', () => {
    mockedQuery.mockReturnValue({ data: undefined, isLoading: true } as any);
    const { container } = renderPage();
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });
});
