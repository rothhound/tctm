import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from './store';

interface AuthState {
  token: string | null;
  expiresAt: string | null;
}

/**
 * Reads the initial auth state from localStorage. Validates that:
 *   - both token and expiresAt are present
 *   - expiresAt parses to a real future date
 * If anything is off, clears localStorage and returns a logged-out state.
 * Protects against tampered values and stale tokens that would otherwise
 * cause the app to think it's authenticated until the first 401.
 */
function loadInitialState(): AuthState {
  try {
    const token = localStorage.getItem('token');
    const expiresAt = localStorage.getItem('expiresAt');
    if (!token || !expiresAt) {
      if (token || expiresAt) {
        localStorage.removeItem('token');
        localStorage.removeItem('expiresAt');
      }
      return { token: null, expiresAt: null };
    }
    const ts = new Date(expiresAt).getTime();
    if (!Number.isFinite(ts) || ts <= Date.now()) {
      localStorage.removeItem('token');
      localStorage.removeItem('expiresAt');
      return { token: null, expiresAt: null };
    }
    return { token, expiresAt };
  } catch {
    return { token: null, expiresAt: null };
  }
}

const initialState: AuthState = loadInitialState();

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials(state, action: PayloadAction<{ token: string; expiresAt: string }>) {
      state.token = action.payload.token;
      state.expiresAt = action.payload.expiresAt;
      try {
        localStorage.setItem('token', action.payload.token);
        localStorage.setItem('expiresAt', action.payload.expiresAt);
      } catch {
        /* private mode etc. — auth still works in-memory */
      }
    },
    logout(state) {
      state.token = null;
      state.expiresAt = null;
      try {
        localStorage.removeItem('token');
        localStorage.removeItem('expiresAt');
      } catch {
        /* ignore */
      }
    },
  },
});

export const { setCredentials, logout } = authSlice.actions;

/** True when there's a token AND its expiry is still in the future. */
export function selectIsAuthenticated(state: RootState): boolean {
  const { token, expiresAt } = state.auth;
  if (!token || !expiresAt) return false;
  const ts = new Date(expiresAt).getTime();
  return Number.isFinite(ts) && ts > Date.now();
}
