import { describe, it, expect } from 'vitest';
import { isSafeRedirect, safeRedirectOr } from './safeRedirect';

describe('isSafeRedirect', () => {
  it.each([
    '/',
    '/active',
    '/task/abc-123',
    '/task/abc?from=x',
    '/settings/prompts',
    '/done#section',
  ])('accepts same-origin relative path %s', (path) => {
    expect(isSafeRedirect(path)).toBe(true);
  });

  it.each([
    null,
    undefined,
    '',
    'active',                    // missing leading slash
    'task/abc',
    'http://evil.com/path',      // absolute URL
    'https://evil.com',
    '//evil.com/path',           // protocol-relative
    '//evil.com',
    'javascript:alert(1)',       // not even path-like; missing slash
    'data:text/html,<script>',
    '\\evil.com',                // backslash
    '/path\\evil',               // mixed backslash
    '/login',                    // login loop
    '/login?from=/active',
    '/login/foo',
  ])('rejects unsafe value %s', (path) => {
    expect(isSafeRedirect(path as any)).toBe(false);
  });
});

describe('safeRedirectOr', () => {
  it('returns the candidate when safe', () => {
    expect(safeRedirectOr('/task/abc', '/active')).toBe('/task/abc');
  });

  it('returns the fallback when candidate is unsafe', () => {
    expect(safeRedirectOr('http://evil.com', '/active')).toBe('/active');
  });

  it('returns the fallback when candidate is null', () => {
    expect(safeRedirectOr(null, '/active')).toBe('/active');
  });

  it('returns the fallback when candidate is /login (loop)', () => {
    expect(safeRedirectOr('/login', '/active')).toBe('/active');
  });
});
