import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

describe('authSlice', () => {
  // We re-import the slice in each test because the initial state is
  // computed once at module load from localStorage.

  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function importFresh() {
    const mod = await import('./authSlice');
    return mod;
  }

  describe('loadInitialState (initial state from localStorage)', () => {
    it('returns logged-out state when localStorage is empty', async () => {
      const { authSlice } = await importFresh();
      const state = authSlice.getInitialState();
      expect(state).toEqual({ token: null, expiresAt: null });
    });

    it('hydrates token + expiresAt when both are valid and in the future', async () => {
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      localStorage.setItem('token', 'jwt-abc');
      localStorage.setItem('expiresAt', future);

      const { authSlice } = await importFresh();
      expect(authSlice.getInitialState()).toEqual({ token: 'jwt-abc', expiresAt: future });
    });

    it('drops state and clears localStorage when expiresAt is in the past', async () => {
      const past = new Date(Date.now() - 60_000).toISOString();
      localStorage.setItem('token', 'jwt-abc');
      localStorage.setItem('expiresAt', past);

      const { authSlice } = await importFresh();
      expect(authSlice.getInitialState()).toEqual({ token: null, expiresAt: null });
      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('expiresAt')).toBeNull();
    });

    it('drops state and clears localStorage when expiresAt is unparseable', async () => {
      localStorage.setItem('token', 'jwt-abc');
      localStorage.setItem('expiresAt', 'not-a-date');

      const { authSlice } = await importFresh();
      expect(authSlice.getInitialState()).toEqual({ token: null, expiresAt: null });
      expect(localStorage.getItem('token')).toBeNull();
    });

    it('drops state and clears localStorage when only token is set (mismatch)', async () => {
      localStorage.setItem('token', 'jwt-abc');

      const { authSlice } = await importFresh();
      expect(authSlice.getInitialState()).toEqual({ token: null, expiresAt: null });
      expect(localStorage.getItem('token')).toBeNull();
    });

    it('returns logged-out state if localStorage access throws', async () => {
      const orig = Storage.prototype.getItem;
      Storage.prototype.getItem = vi.fn(() => { throw new Error('private mode'); });

      const { authSlice } = await importFresh();
      expect(authSlice.getInitialState()).toEqual({ token: null, expiresAt: null });

      Storage.prototype.getItem = orig;
    });
  });

  describe('reducers', () => {
    it('setCredentials updates state AND persists to localStorage', async () => {
      const { authSlice, setCredentials } = await importFresh();
      const next = authSlice.reducer(
        { token: null, expiresAt: null },
        setCredentials({ token: 'new-jwt', expiresAt: '2099-01-01T00:00:00Z' }),
      );
      expect(next).toEqual({ token: 'new-jwt', expiresAt: '2099-01-01T00:00:00Z' });
      expect(localStorage.getItem('token')).toBe('new-jwt');
      expect(localStorage.getItem('expiresAt')).toBe('2099-01-01T00:00:00Z');
    });

    it('logout clears state AND localStorage', async () => {
      localStorage.setItem('token', 'jwt');
      localStorage.setItem('expiresAt', '2099-01-01T00:00:00Z');
      const { authSlice, logout } = await importFresh();
      const next = authSlice.reducer(
        { token: 'jwt', expiresAt: '2099-01-01T00:00:00Z' },
        logout(),
      );
      expect(next).toEqual({ token: null, expiresAt: null });
      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('expiresAt')).toBeNull();
    });

    it('setCredentials survives a throwing localStorage (private mode)', async () => {
      const { authSlice, setCredentials } = await importFresh();
      Storage.prototype.setItem = vi.fn(() => { throw new Error('quota exceeded'); });

      const next = authSlice.reducer(
        { token: null, expiresAt: null },
        setCredentials({ token: 'jwt', expiresAt: '2099-01-01T00:00:00Z' }),
      );
      expect(next.token).toBe('jwt');
    });
  });

  describe('selectIsAuthenticated', () => {
    it('returns false when no token', async () => {
      const { selectIsAuthenticated } = await importFresh();
      expect(selectIsAuthenticated({ auth: { token: null, expiresAt: null } } as any)).toBe(false);
    });

    it('returns false when expiresAt is in the past', async () => {
      const { selectIsAuthenticated } = await importFresh();
      const past = new Date(Date.now() - 1000).toISOString();
      expect(selectIsAuthenticated({ auth: { token: 'x', expiresAt: past } } as any)).toBe(false);
    });

    it('returns true when token is set and expiresAt is in the future', async () => {
      const { selectIsAuthenticated } = await importFresh();
      const future = new Date(Date.now() + 60_000).toISOString();
      expect(selectIsAuthenticated({ auth: { token: 'x', expiresAt: future } } as any)).toBe(true);
    });

    it('returns false when expiresAt is unparseable', async () => {
      const { selectIsAuthenticated } = await importFresh();
      expect(selectIsAuthenticated({ auth: { token: 'x', expiresAt: 'not-a-date' } } as any)).toBe(false);
    });
  });
});
