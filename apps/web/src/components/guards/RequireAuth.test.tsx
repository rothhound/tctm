import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { RequireAuth } from './RequireAuth';
import { authSlice, setCredentials } from '../../store/authSlice';
import { api } from '../../store/api';

function makeStore(authState: { token: string | null; expiresAt: string | null }) {
  const store = configureStore({
    reducer: { [api.reducerPath]: api.reducer, auth: authSlice.reducer },
    middleware: (g) => g().concat(api.middleware),
  });
  if (authState.token && authState.expiresAt) {
    store.dispatch(setCredentials({ token: authState.token, expiresAt: authState.expiresAt }));
  } else if (authState.expiresAt) {
    // Tests that pass an invalid/expired expiresAt without a token are
    // exercising the selectIsAuthenticated path on an in-memory state.
    store.dispatch(setCredentials({ token: 'jwt', expiresAt: authState.expiresAt }));
  }
  return store;
}

// Renders a "/login" route that exposes the `from` query param as text so we
// can assert what RequireAuth redirected with.
function LoginRouteProbe() {
  const loc = useLocation();
  const from = new URLSearchParams(loc.search).get('from') ?? '';
  return <div>Login Page (from={from})</div>;
}

function renderAt(path: string, authState: { token: string | null; expiresAt: string | null }) {
  return render(
    <Provider store={makeStore(authState)}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/active" element={<div>Active Page</div>} />
            <Route path="/task/:id" element={<div>Task Page</div>} />
          </Route>
          <Route path="/login" element={<LoginRouteProbe />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

describe('RequireAuth', () => {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const past = new Date(Date.now() - 60_000).toISOString();

  it('renders the child route when authenticated', () => {
    renderAt('/active', { token: 'jwt', expiresAt: future });
    expect(screen.getByText('Active Page')).toBeInTheDocument();
  });

  it('redirects to /login with from= when no token', () => {
    renderAt('/task/abc-123', { token: null, expiresAt: null });
    expect(screen.queryByText('Task Page')).not.toBeInTheDocument();
    expect(screen.getByText('Login Page (from=/task/abc-123)')).toBeInTheDocument();
  });

  it('redirects to /login when token is expired (proactive expiry check)', () => {
    renderAt('/task/abc-123', { token: 'jwt', expiresAt: past });
    expect(screen.queryByText('Task Page')).not.toBeInTheDocument();
    expect(screen.getByText('Login Page (from=/task/abc-123)')).toBeInTheDocument();
  });

  it('redirects when expiresAt is unparseable', () => {
    renderAt('/active', { token: 'jwt', expiresAt: 'not-a-date' });
    expect(screen.queryByText('Active Page')).not.toBeInTheDocument();
    expect(screen.getByText('Login Page (from=/active)')).toBeInTheDocument();
  });

  it('preserves query string and hash in the from parameter', () => {
    renderAt('/task/abc?q=1#hash', { token: null, expiresAt: null });
    expect(screen.getByText('Login Page (from=/task/abc?q=1#hash)')).toBeInTheDocument();
  });
});
