import { ConfigService } from '@nestjs/config';
import { google, gmail_v1 } from 'googleapis';

const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

export interface ResolvedGmail {
  client: gmail_v1.Gmail;
  mode: 'delegation' | 'refresh_token';
  subject?: string;
}

/**
 * Resolve an authenticated Gmail client. Two modes, in priority order:
 *
 *  1. **Domain-wide delegation** (preferred for a shared/functional Workspace mailbox):
 *     a service account impersonates `GMAIL_IMPERSONATE_SUBJECT`. No interactive consent,
 *     no refresh token to babysit, admin-managed. Requires the Workspace admin to grant the
 *     service account the gmail.readonly scope (Admin → Security → API controls → Domain-wide
 *     delegation).
 *  2. **OAuth2 refresh token** (single-user fallback): `GOOGLE_CLIENT_ID`/`SECRET` +
 *     `GMAIL_REFRESH_TOKEN`.
 *
 * Returns null if neither is configured. Throws if `GMAIL_SERVICE_ACCOUNT_KEY` is present but malformed.
 */
export function resolveGmailClient(config: ConfigService): ResolvedGmail | null {
  const saKeyRaw = config.get<string>('GMAIL_SERVICE_ACCOUNT_KEY');
  const subject = config.get<string>('GMAIL_IMPERSONATE_SUBJECT');
  if (saKeyRaw && subject) {
    const sa = parseServiceAccountKey(saKeyRaw);
    const auth = new google.auth.JWT({
      email: sa.client_email,
      key: sa.private_key,
      scopes: GMAIL_SCOPES,
      subject, // impersonate the shared mailbox
    });
    return { client: google.gmail({ version: 'v1', auth }), mode: 'delegation', subject };
  }

  const clientId = config.get<string>('GOOGLE_CLIENT_ID');
  const clientSecret = config.get<string>('GOOGLE_CLIENT_SECRET');
  const refreshToken = config.get<string>('GMAIL_REFRESH_TOKEN');
  if (clientId && clientSecret && refreshToken) {
    const auth = new google.auth.OAuth2(clientId, clientSecret);
    auth.setCredentials({ refresh_token: refreshToken });
    return { client: google.gmail({ version: 'v1', auth }), mode: 'refresh_token' };
  }

  return null;
}

/** Service-account JSON may be provided raw, or base64-encoded (friendlier for env/config vars). */
function parseServiceAccountKey(raw: string): { client_email: string; private_key: string } {
  let text = raw.trim();
  if (!text.startsWith('{')) {
    text = Buffer.from(text, 'base64').toString('utf-8');
  }
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('GMAIL_SERVICE_ACCOUNT_KEY is not valid JSON (raw or base64-encoded service-account key)');
  }
  if (!json.client_email || !json.private_key) {
    throw new Error('GMAIL_SERVICE_ACCOUNT_KEY missing client_email/private_key');
  }
  return { client_email: json.client_email, private_key: json.private_key };
}
