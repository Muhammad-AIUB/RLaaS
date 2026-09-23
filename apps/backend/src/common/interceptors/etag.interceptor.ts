import { createHash } from 'crypto';
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * ETag-based conditional GET for read-heavy, per-user endpoints.
 *
 * Decorate a handler with `@Cacheable({ maxAge: 30, scope: 'private' })`.
 * The interceptor:
 *  - Computes a weak ETag over the response body, keyed by `user.sub` so two
 *    users do not share an entry.
 *  - On a matching `If-None-Match`, returns 304 with no body.
 *  - Sets `Cache-Control: private, max-age=<n>` (must be `private`: the
 *    response is per-user and must not be cached by a shared proxy).
 *  - Sets `Vary: Authorization` so a shared cache does not serve one user's
 *    response to another.
 *
 * The body is still computed and serialized on the first request; the
 * `If-None-Match` short-circuit only avoids the wire transfer. The expensive
 * part (database, Redis) is left to the handler's own Redis caching.
 */

export const CACHEABLE_KEY = 'rlaas:cacheable';
export type CacheableOptions = {
  maxAge: number;
  scope?: 'private' | 'public';
};

export const Cacheable = (options: CacheableOptions) =>
  Reflect.metadata(CACHEABLE_KEY, options);

@Injectable()
export class EtagInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const opts = this.reflector.getAllAndOverride<CacheableOptions>(
      CACHEABLE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!opts) {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request & { user?: { sub?: string } }>();
    const response = http.getResponse<Response & {
      statusCode: number;
      setHeader: (name: string, value: string) => void;
      send: (body: unknown) => unknown;
    }>();

    response.setHeader(
      'Cache-Control',
      `${opts.scope ?? 'private'}, max-age=${opts.maxAge}`,
    );
    response.setHeader('Vary', 'Authorization');

    return next.handle().pipe(
      tap((body: unknown) => {
        const userKey = request.user?.sub ?? 'anon';
        const etag = `W/"${createHash('sha256')
          .update(JSON.stringify({ userKey, body }))
          .digest('hex')
          .slice(0, 16)}"`;

        response.setHeader('ETag', etag);

        const inm = request.headers['if-none-match'];
        const inmValue = Array.isArray(inm) ? inm[0] : inm;

        if (inmValue === etag) {
          response.statusCode = 304;
          // Send empty body for 304.
          (response as unknown as { write: (s: string) => void }).write('');
          response.end?.();
        }
      }),
    );
  }
}
