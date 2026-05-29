import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Observable, tap } from 'rxjs';
import { AuthService, JwtPayload } from './auth.service';

/**
 * Sliding-session refresh: if the caller's JWT is within the refresh window of
 * expiry, attach a fresh token via X-Refresh-Token / X-Refresh-Expires headers.
 * The client is expected to swap it in.
 *
 * No-op when the request was @Public() (no req.user) or when refresh isn't needed.
 */
@Injectable()
export class RefreshInterceptor implements NestInterceptor {
  constructor(private readonly authService: AuthService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<FastifyRequest & { user?: JwtPayload }>();
    const res = http.getResponse<FastifyReply>();

    return next.handle().pipe(
      tap(() => {
        const user = req.user;
        if (!user || typeof user.exp !== 'number') return;
        const refreshed = this.authService.maybeRefreshToken(user);
        if (!refreshed) return;
        res.header('X-Refresh-Token', refreshed.token);
        res.header('X-Refresh-Expires', refreshed.expiresAt);
      }),
    );
  }
}
