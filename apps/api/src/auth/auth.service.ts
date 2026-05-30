import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import * as jwt from 'jsonwebtoken';

export interface JwtPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

const ACCESS_TOKEN_TTL_SECONDS = 24 * 60 * 60;          // 24h
const REFRESH_WINDOW_SECONDS = 6 * 60 * 60;             // refresh if <6h remaining

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtSecret: string;
  private readonly googleClientId: string;
  private readonly allowedEmail: string;
  private readonly oauthClient: OAuth2Client;

  constructor(private readonly config: ConfigService) {
    this.jwtSecret = config.getOrThrow<string>('JWT_SECRET');
    this.googleClientId = config.getOrThrow<string>('GOOGLE_CLIENT_ID');
    this.allowedEmail = config.getOrThrow<string>('ALLOWED_GOOGLE_EMAIL').toLowerCase();
    this.oauthClient = new OAuth2Client(this.googleClientId);
  }

  async loginWithGoogle(idToken: string): Promise<{ token: string; expiresAt: string }> {
    let email: string | undefined;
    let emailVerified: boolean | undefined;

    try {
      const ticket = await this.oauthClient.verifyIdToken({
        idToken,
        audience: this.googleClientId,
      });
      const payload = ticket.getPayload();
      email = payload?.email;
      emailVerified = payload?.email_verified;
    } catch {
      // Never log the token. Always throw the same generic error.
      throw new UnauthorizedException('Invalid Google credentials');
    }

    if (!email || !emailVerified) {
      throw new UnauthorizedException('Invalid Google credentials');
    }

    if (email.toLowerCase() !== this.allowedEmail) {
      // Log the failed match (rate-limited at the app level by the single-tenant nature).
      this.logger.warn(`Rejected Google sign-in for non-allowed email`);
      throw new UnauthorizedException('Invalid Google credentials');
    }

    return this.issueToken(email);
  }

  /**
   * Returns a new token if the supplied payload is within the refresh window.
   * Otherwise returns null (no refresh needed).
   */
  maybeRefreshToken(payload: JwtPayload): { token: string; expiresAt: string } | null {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const remaining = payload.exp - nowSeconds;
    if (remaining > REFRESH_WINDOW_SECONDS) return null;
    if (remaining <= 0) return null; // expired tokens never reach here (guard rejects), but defend anyway
    return this.issueToken(payload.email);
  }

  verifyToken(token: string): JwtPayload {
    try {
      return jwt.verify(token, this.jwtSecret) as JwtPayload;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private issueToken(email: string): { token: string; expiresAt: string } {
    const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000);
    const token = jwt.sign(
      { sub: 'partner', email } as Omit<JwtPayload, 'iat' | 'exp'>,
      this.jwtSecret,
      { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    );
    return { token, expiresAt: expiresAt.toISOString() };
  }
}
