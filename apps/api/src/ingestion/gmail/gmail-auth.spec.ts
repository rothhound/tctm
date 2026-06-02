import { ConfigService } from '@nestjs/config';
import { resolveGmailClient } from './gmail-auth';

function cfg(env: Record<string, string | undefined>): ConfigService {
  return { get: (k: string) => env[k] } as any;
}

const SA_JSON = JSON.stringify({
  client_email: 'sa@proj.iam.gserviceaccount.com',
  // Construction is lazy — a placeholder key is fine; it's only used when a token is requested.
  private_key: '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n',
});

describe('resolveGmailClient', () => {
  it('uses domain-wide delegation when SA key + subject are set', () => {
    const r = resolveGmailClient(cfg({ GMAIL_SA_KEY: SA_JSON, GMAIL_IMPERSONATE_SUBJECT: 'tasks@firm.com' }));
    expect(r).not.toBeNull();
    expect(r!.mode).toBe('delegation');
    expect(r!.subject).toBe('tasks@firm.com');
    expect(r!.client).toBeDefined();
  });

  it('accepts a base64-encoded service-account key', () => {
    const b64 = Buffer.from(SA_JSON, 'utf-8').toString('base64');
    const r = resolveGmailClient(cfg({ GMAIL_SA_KEY: b64, GMAIL_IMPERSONATE_SUBJECT: 'tasks@firm.com' }));
    expect(r!.mode).toBe('delegation');
  });

  it('prefers delegation over a refresh token when both are present', () => {
    const r = resolveGmailClient(
      cfg({
        GMAIL_SA_KEY: SA_JSON,
        GMAIL_IMPERSONATE_SUBJECT: 'tasks@firm.com',
        GOOGLE_CLIENT_ID: 'cid',
        GOOGLE_CLIENT_SECRET: 'sec',
        GMAIL_REFRESH_TOKEN: 'rt',
      }),
    );
    expect(r!.mode).toBe('delegation');
  });

  it('falls back to OAuth refresh-token mode', () => {
    const r = resolveGmailClient(cfg({ GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'sec', GMAIL_REFRESH_TOKEN: 'rt' }));
    expect(r!.mode).toBe('refresh_token');
  });

  it('returns null when nothing is configured', () => {
    expect(resolveGmailClient(cfg({}))).toBeNull();
  });

  it('returns null when only the impersonation subject is set (no SA key, no refresh token)', () => {
    expect(resolveGmailClient(cfg({ GMAIL_IMPERSONATE_SUBJECT: 'tasks@firm.com' }))).toBeNull();
  });

  it('throws when GMAIL_SA_KEY is malformed', () => {
    expect(() =>
      resolveGmailClient(cfg({ GMAIL_SA_KEY: 'not-json', GMAIL_IMPERSONATE_SUBJECT: 'tasks@firm.com' })),
    ).toThrow();
  });
});
