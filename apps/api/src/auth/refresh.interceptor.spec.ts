import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, lastValueFrom } from 'rxjs';
import { RefreshInterceptor } from './refresh.interceptor';
import { AuthService, JwtPayload } from './auth.service';

function makeContext(req: any, res: any): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as any;
}

function makeHandler(): CallHandler {
  return { handle: () => of('handler-result') };
}

describe('RefreshInterceptor', () => {
  let interceptor: RefreshInterceptor;
  let authService: Partial<AuthService>;

  const payload: JwtPayload = {
    sub: 'partner',
    email: 'partner@example.com',
    iat: Math.floor(Date.now() / 1000) - 60,
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  beforeEach(() => {
    authService = { maybeRefreshToken: jest.fn() };
    interceptor = new RefreshInterceptor(authService as AuthService);
  });

  it('sets refresh headers when AuthService returns a new token', async () => {
    (authService.maybeRefreshToken as jest.Mock).mockReturnValue({
      token: 'fresh-jwt',
      expiresAt: '2026-06-01T00:00:00Z',
    });

    const header = jest.fn();
    const ctx = makeContext({ user: payload }, { header });

    await lastValueFrom(interceptor.intercept(ctx, makeHandler()));

    expect(authService.maybeRefreshToken).toHaveBeenCalledWith(payload);
    expect(header).toHaveBeenCalledWith('X-Refresh-Token', 'fresh-jwt');
    expect(header).toHaveBeenCalledWith('X-Refresh-Expires', '2026-06-01T00:00:00Z');
  });

  it('does not set headers when AuthService returns null (token still fresh)', async () => {
    (authService.maybeRefreshToken as jest.Mock).mockReturnValue(null);

    const header = jest.fn();
    const ctx = makeContext({ user: payload }, { header });

    await lastValueFrom(interceptor.intercept(ctx, makeHandler()));

    expect(header).not.toHaveBeenCalled();
  });

  it('is a no-op when the request has no user (public endpoint)', async () => {
    const header = jest.fn();
    const ctx = makeContext({ user: undefined }, { header });

    await lastValueFrom(interceptor.intercept(ctx, makeHandler()));

    expect(authService.maybeRefreshToken).not.toHaveBeenCalled();
    expect(header).not.toHaveBeenCalled();
  });

  it('is a no-op when req.user has no exp (malformed)', async () => {
    const header = jest.fn();
    const ctx = makeContext({ user: { sub: 'partner', email: 'x@y.com' } as any }, { header });

    await lastValueFrom(interceptor.intercept(ctx, makeHandler()));

    expect(authService.maybeRefreshToken).not.toHaveBeenCalled();
    expect(header).not.toHaveBeenCalled();
  });
});
