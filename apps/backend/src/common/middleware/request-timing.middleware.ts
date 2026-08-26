import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import {
  currentStore,
  formatServerTiming,
  runWithTiming,
} from '../timing/request-timing';

/**
 * Establishes the per-request timing context and writes `Server-Timing` just
 * before the response is flushed.
 *
 * Middleware rather than an interceptor on purpose: an interceptor's
 * `next.handle()` is subscribed outside the `AsyncLocalStorage.run()` callback,
 * so the store would not be visible to the services doing the work.
 */
@Injectable()
export class RequestTimingMiddleware implements NestMiddleware {
  use(_request: Request, response: Response, next: NextFunction): void {
    const startedAt = performance.now();

    runWithTiming(() => {
      // Captured here rather than read at flush time so the header never
      // depends on which async context `res.end` happens to run in.
      const store = currentStore();
      const originalEnd = response.end.bind(response);

      response.end = ((...args: Parameters<Response['end']>) => {
        if (store && !response.headersSent) {
          store.set('total', performance.now() - startedAt);
          const header = formatServerTiming(store);

          if (header) {
            response.setHeader('Server-Timing', header);
          }
        }

        return originalEnd(...args);
      }) as Response['end'];

      next();
    });
  }
}
