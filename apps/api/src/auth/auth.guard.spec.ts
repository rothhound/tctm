import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let authService: Partial<AuthService>;
  let reflector: Reflector;

  beforeEach(() => {
    authService = {
      verifyToken: jest.fn().mockReturnValue({ sub: 'partner', iat: 1, exp: 2 }),
    };
    reflector = new Reflector();
    guard = new AuthGuard(authService as AuthService, reflector);
  });

  function createContext(headers: Record<string, string> = {}, isPublic = false): ExecutionContext {
    if (isPublic) {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    } else {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    }

    return {
      switchToHttp: () => ({
        getRequest: () => ({ headers, user: undefined }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any;
  }

  it('allows requests with @Public() decorator', () => {
    const context = createContext({}, true);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('throws when no Authorization header is present', () => {
    const context = createContext({});
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('throws when Authorization header does not start with Bearer', () => {
    const context = createContext({ authorization: 'Basic abc123' });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('validates token and attaches user to request', () => {
    const context = createContext({ authorization: 'Bearer valid-token' });
    const result = guard.canActivate(context);

    expect(result).toBe(true);
    expect(authService.verifyToken).toHaveBeenCalledWith('valid-token');
  });

  it('throws when token verification fails', () => {
    (authService.verifyToken as jest.Mock).mockImplementation(() => {
      throw new UnauthorizedException('Invalid token');
    });

    const context = createContext({ authorization: 'Bearer bad-token' });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
