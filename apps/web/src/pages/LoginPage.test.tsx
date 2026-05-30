import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { LoginPage } from './LoginPage';
import { api } from '../store/api';
import { authSlice } from '../store/authSlice';

// Mock @react-oauth/google so we can drive the sign-in callbacks programmatically.
vi.mock('@react-oauth/google', async () => {
  const actual = await vi.importActual<typeof import('@react-oauth/google')>('@react-oauth/google');
  return {
    ...actual,
    GoogleLogin: ({ onSuccess, onError }: any) => (
      <div>
        <button data-testid="mock-google-success" onClick={() => onSuccess({ credential: 'fake-google-id-token' })}>
          Mock Google Success
        </button>
        <button data-testid="mock-google-no-cred" onClick={() => onSuccess({ credential: undefined })}>
          Mock Google No-Cred
        </button>
        <button data-testid="mock-google-error" onClick={() => onError?.()}>
          Mock Google Error
        </button>
      </div>
    ),
  };
});

// Mock react-router's useNavigate.
const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

// Mock the RTK Query hook. Each test sets up the mutation's resolve/reject behavior.
const loginWithGoogleMock = vi.fn();
const setCredentialsSpy = vi.fn();
vi.mock('../store/api', async () => {
  const actual = await vi.importActual<typeof import('../store/api')>('../store/api');
  return {
    ...actual,
    useLoginWithGoogleMutation: () => [loginWithGoogleMock, { isLoading: false }],
  };
});

// Spy on the setCredentials action without breaking other reducer behavior.
vi.mock('../store/authSlice', async () => {
  const actual = await vi.importActual<typeof import('../store/authSlice')>('../store/authSlice');
  return {
    ...actual,
    setCredentials: (...args: any[]) => {
      setCredentialsSpy(...args);
      return actual.setCredentials(...(args as [any]));
    },
  };
});

function makeStore() {
  return configureStore({
    reducer: { [api.reducerPath]: api.reducer, auth: authSlice.reducer },
    middleware: (gDM) => gDM().concat(api.middleware),
  });
}

function renderLoginPage(opts: { initialPath?: string; preloadedAuth?: { token: string | null; expiresAt: string | null } } = {}) {
  const { initialPath = '/login', preloadedAuth } = opts;
  const baseStore = makeStore();
  // Apply preloaded auth via dispatch so tests can exercise the "already
  // authenticated" branch without rebuilding the store config.
  if (preloadedAuth?.token && preloadedAuth.expiresAt) {
    baseStore.dispatch({ type: 'auth/setCredentials', payload: preloadedAuth });
  }
  const utils = render(
    <Provider store={baseStore}>
      <MemoryRouter initialEntries={[initialPath]}>
        <LoginPage />
      </MemoryRouter>
    </Provider>,
  );
  return { ...utils, store: baseStore };
}

describe('LoginPage', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    loginWithGoogleMock.mockReset();
    setCredentialsSpy.mockReset();
    localStorage.clear();
  });

  it('renders the app logo and a sign-in prompt', () => {
    renderLoginPage();
    expect(screen.getByRole('img', { name: 'TCTM' })).toBeInTheDocument();
    expect(screen.getByText(/Sign in with your authorized Google account/i)).toBeInTheDocument();
  });

  it('renders the Google sign-in button', () => {
    renderLoginPage();
    expect(screen.getByTestId('mock-google-success')).toBeInTheDocument();
  });

  it('forwards the Google credential to loginWithGoogle and stores the result on success', async () => {
    const result = { token: 'jwt-from-server', expiresAt: '2026-06-01T00:00:00Z' };
    loginWithGoogleMock.mockReturnValue({ unwrap: vi.fn().mockResolvedValue(result) });

    renderLoginPage();
    fireEvent.click(screen.getByTestId('mock-google-success'));

    await waitFor(() => {
      expect(loginWithGoogleMock).toHaveBeenCalledWith({ idToken: 'fake-google-id-token' });
    });
    await waitFor(() => {
      expect(setCredentialsSpy).toHaveBeenCalledWith(result);
    });
    expect(navigateMock).toHaveBeenCalledWith('/active', { replace: true });
  });

  it('shows an error and does not navigate when loginWithGoogle rejects (unauthorized email)', async () => {
    loginWithGoogleMock.mockReturnValue({ unwrap: vi.fn().mockRejectedValue(new Error('Unauthorized')) });

    renderLoginPage();
    fireEvent.click(screen.getByTestId('mock-google-success'));

    await waitFor(() => {
      expect(screen.getByText(/This account is not authorized/i)).toBeInTheDocument();
    });
    expect(navigateMock).not.toHaveBeenCalled();
    expect(setCredentialsSpy).not.toHaveBeenCalled();
  });

  it('shows an error when Google returns no credential, without calling the API', () => {
    renderLoginPage();
    fireEvent.click(screen.getByTestId('mock-google-no-cred'));

    expect(screen.getByText(/no credential returned/i)).toBeInTheDocument();
    expect(loginWithGoogleMock).not.toHaveBeenCalled();
  });

  it('shows an error when the Google button itself errors', () => {
    renderLoginPage();
    fireEvent.click(screen.getByTestId('mock-google-error'));
    expect(screen.getByText(/Please try again/i)).toBeInTheDocument();
  });

  describe('deep-link redirect (?from=)', () => {
    it('navigates to the from path after successful login', async () => {
      const result = { token: 'jwt', expiresAt: '2099-01-01T00:00:00Z' };
      loginWithGoogleMock.mockReturnValue({ unwrap: vi.fn().mockResolvedValue(result) });

      renderLoginPage({ initialPath: '/login?from=%2Ftask%2Fabc-123' });
      fireEvent.click(screen.getByTestId('mock-google-success'));

      await waitFor(() => {
        expect(navigateMock).toHaveBeenCalledWith('/task/abc-123', { replace: true });
      });
    });

    it('falls back to /active when from is missing', async () => {
      const result = { token: 'jwt', expiresAt: '2099-01-01T00:00:00Z' };
      loginWithGoogleMock.mockReturnValue({ unwrap: vi.fn().mockResolvedValue(result) });

      renderLoginPage({ initialPath: '/login' });
      fireEvent.click(screen.getByTestId('mock-google-success'));

      await waitFor(() => {
        expect(navigateMock).toHaveBeenCalledWith('/active', { replace: true });
      });
    });

    it('rejects an open-redirect attempt in from and falls back to /active', async () => {
      const result = { token: 'jwt', expiresAt: '2099-01-01T00:00:00Z' };
      loginWithGoogleMock.mockReturnValue({ unwrap: vi.fn().mockResolvedValue(result) });

      renderLoginPage({ initialPath: '/login?from=https%3A%2F%2Fevil.com%2Fpath' });
      fireEvent.click(screen.getByTestId('mock-google-success'));

      await waitFor(() => {
        expect(navigateMock).toHaveBeenCalledWith('/active', { replace: true });
      });
    });

    it('rejects a protocol-relative from and falls back to /active', async () => {
      const result = { token: 'jwt', expiresAt: '2099-01-01T00:00:00Z' };
      loginWithGoogleMock.mockReturnValue({ unwrap: vi.fn().mockResolvedValue(result) });

      renderLoginPage({ initialPath: '/login?from=%2F%2Fevil.com' });
      fireEvent.click(screen.getByTestId('mock-google-success'));

      await waitFor(() => {
        expect(navigateMock).toHaveBeenCalledWith('/active', { replace: true });
      });
    });
  });

  describe('already-authenticated', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    it('redirects to /active when already authenticated and no from', () => {
      renderLoginPage({ preloadedAuth: { token: 'jwt', expiresAt: future } });
      // The login button should not render — instead Navigate moved us elsewhere.
      expect(screen.queryByTestId('mock-google-success')).not.toBeInTheDocument();
    });

    it('redirects to the from path when already authenticated', () => {
      renderLoginPage({
        initialPath: '/login?from=%2Ftask%2Fabc',
        preloadedAuth: { token: 'jwt', expiresAt: future },
      });
      expect(screen.queryByTestId('mock-google-success')).not.toBeInTheDocument();
    });
  });
});
