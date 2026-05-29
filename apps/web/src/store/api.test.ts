import { describe, it, expect } from 'vitest';
import { extractRefreshedCredentials, shouldClearSession } from './api';

describe('extractRefreshedCredentials', () => {
  it('returns null when headers are undefined', () => {
    expect(extractRefreshedCredentials(undefined)).toBeNull();
  });

  it('returns null when neither header is present', () => {
    expect(extractRefreshedCredentials(new Headers({ 'content-type': 'application/json' }))).toBeNull();
  });

  it('returns null when only X-Refresh-Token is present', () => {
    expect(extractRefreshedCredentials(new Headers({ 'x-refresh-token': 'abc' }))).toBeNull();
  });

  it('returns null when only X-Refresh-Expires is present', () => {
    expect(extractRefreshedCredentials(new Headers({ 'x-refresh-expires': '2026-06-01T00:00:00Z' }))).toBeNull();
  });

  it('returns the new credentials when both headers are present', () => {
    const headers = new Headers({
      'x-refresh-token': 'rotated-jwt',
      'x-refresh-expires': '2026-06-01T00:00:00Z',
    });
    expect(extractRefreshedCredentials(headers)).toEqual({
      token: 'rotated-jwt',
      expiresAt: '2026-06-01T00:00:00Z',
    });
  });

  it('reads headers case-insensitively (Headers normalizes keys)', () => {
    const headers = new Headers();
    headers.set('X-Refresh-Token', 'rotated');
    headers.set('X-Refresh-Expires', '2026-06-01T00:00:00Z');
    const result = extractRefreshedCredentials(headers);
    expect(result?.token).toBe('rotated');
  });
});

describe('shouldClearSession', () => {
  it('returns true for a 401 from a normal endpoint (session expired)', () => {
    expect(shouldClearSession(401, 'getTaskCounts')).toBe(true);
    expect(shouldClearSession(401, 'getTasks')).toBe(true);
    expect(shouldClearSession(401, 'completeTask')).toBe(true);
  });

  it('returns false for a 401 from the loginWithGoogle endpoint (expected login failure)', () => {
    expect(shouldClearSession(401, 'loginWithGoogle')).toBe(false);
  });

  it('returns false for non-401 statuses', () => {
    expect(shouldClearSession(200, 'getTaskCounts')).toBe(false);
    expect(shouldClearSession(403, 'getTaskCounts')).toBe(false);
    expect(shouldClearSession(500, 'getTaskCounts')).toBe(false);
  });

  it('returns false for fetch / parse errors (non-numeric status)', () => {
    expect(shouldClearSession('FETCH_ERROR', 'getTaskCounts')).toBe(false);
    expect(shouldClearSession('PARSING_ERROR', 'getTaskCounts')).toBe(false);
    expect(shouldClearSession(undefined, 'getTaskCounts')).toBe(false);
  });
});
