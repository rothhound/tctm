import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';

export interface JwtPayload {
  sub: string;
  iat: number;
  exp: number;
}

@Injectable()
export class AuthService {
  private readonly jwtSecret: string;
  private readonly passwordHash: string;

  constructor(private readonly config: ConfigService) {
    this.jwtSecret = config.getOrThrow<string>('JWT_SECRET');
    this.passwordHash = config.getOrThrow<string>('AUTH_PASSWORD_HASH');
  }

  async login(password: string): Promise<{ token: string; expiresAt: string }> {
    const valid = await bcrypt.compare(password, this.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid password');
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const token = jwt.sign(
      { sub: 'partner' } as Omit<JwtPayload, 'iat' | 'exp'>,
      this.jwtSecret,
      { expiresIn: '24h' },
    );

    return { token, expiresAt: expiresAt.toISOString() };
  }

  verifyToken(token: string): JwtPayload {
    try {
      return jwt.verify(token, this.jwtSecret) as JwtPayload;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
