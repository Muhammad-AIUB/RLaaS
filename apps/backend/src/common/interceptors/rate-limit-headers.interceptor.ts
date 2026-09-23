import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';

/**
 * Emits `X-RateLimit-*` and `Retry-After` headers on every request that is
 * tracked by Nest's throttler. The throttler stores its remaining / reset
 * counts in `res.locals.throttler` after running.
 *
 * Why a separate interceptor rather than reading throttler state from inside
 * each handler: it keeps the contract uniform — every protected endpoint
 * answers with the same headers — and it lets us add `X-RateLimit-Policy` for
 * the IETF draft without touching controllers.
 *
 * Headers follow the conventions in `draft-ietf-httpapi-ratelimit-headers`:
 *  - `RateLimit-Limit` / `RateLimit-Remaining` / `RateLimit-Reset`
 *  - `X-RateLimit-Limit` / `X-RateLimit-Remaining` / `X-RateLimit-Reset` (legacy)
 *  - `Retry-After` on 429
 *
 * If the throttler did not run on this request (e.g. an `@Public()` route),
 * the interceptor is a no-op.
 */

type ThrottlerLocals = {
  throttler?: {
    limit?: number;
    remaining?: number;
    timeToBlockExpire?: number; // ms until the bucket resets
  };
};

@Injectable()
export class RateLimitHeadersInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response & { locals: ThrottlerLocals }>();

    const locals = response.locals?.throttler;

    if (!locals) {
      return next.handle();
    }

    const limit = locals.limit ?? 0;
    const remaining = locals.remaining ?? 0;
    const resetSeconds = Math.ceil((locals.timeToBlockExpire ?? 0) / 1000);

    response.setHeader('RateLimit-Limit', String(limit));
    response.setHeader('RateLimit-Remaining', String(Math.max(remaining, 0)));
    response.setHeader('RateLimit-Reset', String(Math.max(resetSeconds, 0)));
    response.setHeader('X-RateLimit-Limit', String(limit));
    response.setHeader('X-RateLimit-Remaining', String(Math.max(remaining, 0)));
    response.setHeader('X-RateLimit-Reset', String(Math.max(resetSeconds, 0)));

    const onFinish = () => {
      if (response.statusCode === 429 && resetSeconds > 0) {
        response.setHeader('Retry-After', String(resetSeconds));
      }
      response.removeListener('finish', onFinish);
    };

    response.on('finish', onFinish);

    void request;
    return next.handle();
  }
}
