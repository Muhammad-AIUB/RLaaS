import { createHash } from 'crypto';
import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { RedisService } from '../../redis/redis.service';

/**
 * Idempotency-Key handling for write endpoints.
 *
 * Behaviour matches the IETF draft `draft-ietf-httpapi-idempotency-key`:
 *  - The header `Idempotency-Key` is read off the request; clients that omit
 *    it opt out and the request proceeds without protection (write endpoints
 *    must still be safe in that case via DB constraints).
 *  - The first request with a given key is executed, its response (status +
 *    body) is cached in Redis for 24h, and the response is returned.
 *  - A retry with the same key but a different request body hash is rejected
 *    with 409 — the same key on two different requests is a client bug, and
 *    silently replaying the cached response would be a data-loss risk.
 *  - A retry with the same key and the same body returns the cached response
 *    with header `Idempotent-Replayed: true` and HTTP status preserved.
 *  - Concurrent requests with the same key race for a 60s claim token in
 *    Redis; the loser re-reads and either replays or conflicts.
 *  - If Redis is unreachable, the request executes without protection rather
 *    than refusing every write.
 *
 * Provided in `AppModule` so `RedisService` is constructor-injected.
 */

export const IDEMPOTENT_KEY = 'rlaas:idempotent';

export const Idempotent = () => SetMetadata(IDEMPOTENT_KEY, true);

const TTL_SECONDS = 24 * 60 * 60;
const CLAIM_TTL_SECONDS = 60;

export type IdempotencyCacheRecord = {
  status: number;
  body: unknown;
  bodyHash: string;
};

function hashBody(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly redisService: RedisService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const isIdempotent = this.reflector.getAllAndOverride<boolean>(
      IDEMPOTENT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!isIdempotent) {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request & { body: unknown }>();
    const response = http.getResponse<{
      statusCode: number;
      setHeader: (name: string, value: string) => void;
    }>();

    const rawKey = request.headers['idempotency-key'];
    const headerKey = Array.isArray(rawKey) ? rawKey[0] : rawKey;

    if (!headerKey || typeof headerKey !== 'string') {
      return next.handle();
    }

    if (headerKey.length < 8 || headerKey.length > 255) {
      throw new HttpException(
        'Idempotency-Key must be 8-255 characters',
        400,
      );
    }

    const bodyHash = hashBody(request.body);
    const cacheKey = `idem:${request.method}:${request.path}:${headerKey}`;

    type CacheLookup =
      | { state: 'fresh' }
      | { state: 'replay'; record: IdempotencyCacheRecord }
      | { state: 'conflict'; record: IdempotencyCacheRecord };

    const lookup: CacheLookup = await (async () => {
      try {
        const redis = this.redisService.getClient();
        const existing = await redis.get(cacheKey);

        if (existing) {
          const record = JSON.parse(existing) as IdempotencyCacheRecord;

          if (record.bodyHash !== bodyHash) {
            return { state: 'conflict', record };
          }

          return { state: 'replay', record };
        }

        const claimed = await redis.set(
          cacheKey,
          JSON.stringify({ claimToken: true, bodyHash }),
          'EX',
          CLAIM_TTL_SECONDS,
          'NX',
        );

        if (claimed !== 'OK') {
          const reread = await redis.get(cacheKey);

          if (reread) {
            const record = JSON.parse(reread) as IdempotencyCacheRecord;

            if (record.bodyHash !== bodyHash) {
              return { state: 'conflict', record };
            }

            return { state: 'replay', record };
          }
        }

        return { state: 'fresh' };
      } catch {
        // Redis is down. Execute the request without protection rather than
        // refusing every write.
        return { state: 'fresh' };
      }
    })();

    if (lookup.state === 'conflict') {
      throw new ConflictException(
        'Idempotency-Key reused with a different request body',
      );
    }

    if (lookup.state === 'replay') {
      response.setHeader('Idempotent-Replayed', 'true');
      response.statusCode = lookup.record.status;
      return of(lookup.record.body);
    }

    return next.handle().pipe(
      tap({
        next: async (body: unknown) => {
          const status = response.statusCode;
          const record: IdempotencyCacheRecord = { status, body, bodyHash };
          try {
            await this.redisService
              .getClient()
              .set(cacheKey, JSON.stringify(record), 'EX', TTL_SECONDS);
          } catch {
            /* non-critical */
          }
        },
        error: async () => {
          try {
            await this.redisService.getClient().del(cacheKey);
          } catch {
            /* non-critical */
          }
        },
      }),
    );
  }
}
