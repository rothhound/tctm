/**
 * Open-redirect protection: only accept paths that stay on this origin.
 *
 * Returns the path verbatim if safe, otherwise returns the fallback.
 *
 * Rejected:
 *   - Absolute URLs ("http://evil.com/path")
 *   - Protocol-relative URLs ("//evil.com/path")
 *   - Anything not starting with "/"
 *   - `/login` itself (would create a loop after successful login)
 *   - Empty / null / undefined
 *
 * Accepted:
 *   - Same-origin relative paths starting with a single "/" (e.g. "/task/abc?q=1")
 */
export function safeRedirectOr(candidate: string | null | undefined, fallback: string): string {
  if (!isSafeRedirect(candidate)) return fallback;
  return candidate as string;
}

export function isSafeRedirect(candidate: string | null | undefined): boolean {
  if (!candidate || typeof candidate !== 'string') return false;
  if (!candidate.startsWith('/')) return false;
  if (candidate.startsWith('//')) return false;        // protocol-relative
  if (candidate.includes('\\')) return false;          // backslash tricks
  if (candidate === '/login' || candidate.startsWith('/login?') || candidate.startsWith('/login/')) return false;
  return true;
}
