import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  const JWT_SECRET = 'test-jwt-secret-for-testing';
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('correct-password', 10);
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              if (key === 'JWT_SECRET') return JWT_SECRET;
              if (key === 'AUTH_PASSWORD_HASH') return passwordHash;
              throw new Error(`Unknown config key: ${key}`);
            },
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('login', () => {
    it('returns a JWT and expiry for correct password', async () => {
      const result = await service.login('correct-password');

      expect(result.token).toBeDefined();
      expect(result.expiresAt).toBeDefined();

      const decoded = jwt.verify(result.token, JWT_SECRET) as any;
      expect(decoded.sub).toBe('partner');
      expect(decoded.exp).toBeDefined();
    });

    it('throws UnauthorizedException for wrong password', async () => {
      await expect(service.login('wrong-password')).rejects.toThrow(UnauthorizedException);
    });

    it('token expires in approximately 24 hours', async () => {
      const result = await service.login('correct-password');
      const expiresAt = new Date(result.expiresAt).getTime();
      const expectedExpiry = Date.now() + 24 * 60 * 60 * 1000;

      // Allow 5 second tolerance
      expect(Math.abs(expiresAt - expectedExpiry)).toBeLessThan(5000);
    });
  });

  describe('verifyToken', () => {
    it('returns payload for valid token', async () => {
      const { token } = await service.login('correct-password');
      const payload = service.verifyToken(token);

      expect(payload.sub).toBe('partner');
      expect(payload.iat).toBeDefined();
      expect(payload.exp).toBeDefined();
    });

    it('throws UnauthorizedException for invalid token', () => {
      expect(() => service.verifyToken('invalid-token')).toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for expired token', () => {
      const token = jwt.sign({ sub: 'partner' }, JWT_SECRET, { expiresIn: '-1s' });
      expect(() => service.verifyToken(token)).toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for token with wrong secret', () => {
      const token = jwt.sign({ sub: 'partner' }, 'wrong-secret', { expiresIn: '1h' });
      expect(() => service.verifyToken(token)).toThrow(UnauthorizedException);
    });
  });
});
