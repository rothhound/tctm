import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { AuthService } from './auth.service';

// Mock the Google client. `verifyIdToken` returns whatever the test sets up.
const mockVerifyIdToken = jest.fn();
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: mockVerifyIdToken,
  })),
}));

describe('AuthService', () => {
  let service: AuthService;
  const JWT_SECRET = 'test-jwt-secret-for-testing';
  const CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';
  const ALLOWED_EMAIL = 'partner@example.com';

  beforeEach(async () => {
    mockVerifyIdToken.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              if (key === 'JWT_SECRET') return JWT_SECRET;
              if (key === 'GOOGLE_CLIENT_ID') return CLIENT_ID;
              if (key === 'ALLOWED_GOOGLE_EMAIL') return ALLOWED_EMAIL;
              throw new Error(`Unknown config key: ${key}`);
            },
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('loginWithGoogle', () => {
    it('issues a JWT when Google returns a verified, allowlisted email', async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({ email: ALLOWED_EMAIL, email_verified: true }),
      });

      const result = await service.loginWithGoogle('valid-id-token');

      expect(mockVerifyIdToken).toHaveBeenCalledWith({ idToken: 'valid-id-token', audience: CLIENT_ID });
      const decoded = jwt.verify(result.token, JWT_SECRET) as any;
      expect(decoded.sub).toBe('partner');
      expect(decoded.email).toBe(ALLOWED_EMAIL);
      expect(decoded.exp).toBeDefined();
    });

    it('accepts case-insensitive email match', async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({ email: 'PARTNER@example.com', email_verified: true }),
      });
      await expect(service.loginWithGoogle('valid')).resolves.toHaveProperty('token');
    });

    it('rejects when email does not match the allowlist', async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({ email: 'intruder@example.com', email_verified: true }),
      });
      await expect(service.loginWithGoogle('valid-id-token')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when email_verified is false', async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({ email: ALLOWED_EMAIL, email_verified: false }),
      });
      await expect(service.loginWithGoogle('valid-id-token')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when payload has no email', async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({ email_verified: true }),
      });
      await expect(service.loginWithGoogle('valid-id-token')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when verifyIdToken throws (invalid signature, expired, etc.)', async () => {
      mockVerifyIdToken.mockRejectedValue(new Error('Invalid token signature'));
      await expect(service.loginWithGoogle('bad-token')).rejects.toThrow(UnauthorizedException);
    });

    it('issued token expires in approximately 24 hours', async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({ email: ALLOWED_EMAIL, email_verified: true }),
      });
      const result = await service.loginWithGoogle('valid');
      const expiresAt = new Date(result.expiresAt).getTime();
      const expectedExpiry = Date.now() + 24 * 60 * 60 * 1000;
      expect(Math.abs(expiresAt - expectedExpiry)).toBeLessThan(5000);
    });
  });

  describe('maybeRefreshToken', () => {
    function makePayload(secondsUntilExpiry: number) {
      const now = Math.floor(Date.now() / 1000);
      return { sub: 'partner', email: ALLOWED_EMAIL, iat: now - 1, exp: now + secondsUntilExpiry };
    }

    it('returns null when token has more than 6h remaining', () => {
      const payload = makePayload(8 * 60 * 60);
      expect(service.maybeRefreshToken(payload)).toBeNull();
    });

    it('returns a fresh token when within the 6h refresh window', () => {
      const payload = makePayload(3 * 60 * 60);
      const result = service.maybeRefreshToken(payload);
      expect(result).not.toBeNull();
      const decoded = jwt.verify(result!.token, JWT_SECRET) as any;
      expect(decoded.email).toBe(ALLOWED_EMAIL);
      expect(decoded.exp).toBeGreaterThan(payload.exp);
    });

    it('returns null for an already-expired payload', () => {
      const payload = makePayload(-60);
      expect(service.maybeRefreshToken(payload)).toBeNull();
    });
  });

  describe('verifyToken', () => {
    it('returns payload for valid token', async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({ email: ALLOWED_EMAIL, email_verified: true }),
      });
      const { token } = await service.loginWithGoogle('valid');
      const payload = service.verifyToken(token);

      expect(payload.sub).toBe('partner');
      expect(payload.email).toBe(ALLOWED_EMAIL);
      expect(payload.iat).toBeDefined();
      expect(payload.exp).toBeDefined();
    });

    it('throws UnauthorizedException for invalid token', () => {
      expect(() => service.verifyToken('invalid-token')).toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for expired token', () => {
      const token = jwt.sign({ sub: 'partner', email: ALLOWED_EMAIL }, JWT_SECRET, { expiresIn: '-1s' });
      expect(() => service.verifyToken(token)).toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for token with wrong secret', () => {
      const token = jwt.sign({ sub: 'partner', email: ALLOWED_EMAIL }, 'wrong-secret', { expiresIn: '1h' });
      expect(() => service.verifyToken(token)).toThrow(UnauthorizedException);
    });
  });
});
