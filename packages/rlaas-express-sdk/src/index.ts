import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type {
  GatewayCheckRequest,
  GatewayCheckResponse,
  RlaasErrorResponse,
} from '@rlaas/shared';

export interface CreateRlaasMiddlewareOptions {
  apiKey: string;
  gatewayUrl: string;
  userTierResolver?: (request: Request) => string | Promise<string>;
  ipResolver?: (request: Request) => string;
  fetchImpl?: typeof fetch;
  onError?: (
    error: unknown,
    request: Request,
    response: Response,
  ) => void | Promise<void>;
}

function resolveIp(request: Request): string {
  const forwarded = request.headers['x-forwarded-for'];

  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }

  const cfIp = request.headers['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp.length > 0) {
    return cfIp;
  }

  return (
    request.ip ||
    request.socket.remoteAddress ||
    request.connection.remoteAddress ||
    '127.0.0.1'
  );
}

function stripQuery(url: string): string {
  try {
    return new URL(url, 'http://localhost').pathname;
  } catch {
    return url.split('?')[0] ?? url;
  }
}

export function createRlaasMiddleware(
  options: CreateRlaasMiddlewareOptions,
): RequestHandler {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  if (!fetchImpl) {
    throw new Error(
      'No fetch implementation available. Provide options.fetchImpl in this environment.',
    );
  }

  return async (request: Request, response: Response, next: NextFunction) => {
    try {
      const userTier = await options.userTierResolver?.(request);
      const payload: GatewayCheckRequest = {
        apiKey: options.apiKey,
        ip: options.ipResolver?.(request) ?? resolveIp(request),
        endpoint: stripQuery(request.originalUrl || request.url),
        method: request.method.toUpperCase(),
        userTier: userTier ?? 'free',
      };

      const gatewayResponse = await fetchImpl(options.gatewayUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = (await gatewayResponse.json()) as GatewayCheckResponse | RlaasErrorResponse;

      if (!gatewayResponse.ok) {
        throw new Error(
          'message' in result ? result.message : 'Gateway request failed',
        );
      }

      if ('allowed' in result && result.allowed) {
        response.setHeader('X-RateLimit-Limit', String(result.limit));
        response.setHeader('X-RateLimit-Remaining', String(result.remaining));
        response.setHeader('X-RateLimit-Algorithm', result.algorithm);
        return next();
      }

      if ('allowed' in result && !result.allowed) {
        response.setHeader('Retry-After', String(result.retryAfter));
        response.setHeader('X-RateLimit-Limit', String(result.limit));
        response.setHeader('X-RateLimit-Remaining', String(result.remaining));
        response.setHeader('X-RateLimit-Algorithm', result.algorithm);

        return response.status(429).json({
          error: result.reason,
          limit: result.limit,
          remaining: result.remaining,
          retryAfter: result.retryAfter,
          algorithm: result.algorithm,
        });
      }

      throw new Error('Unexpected gateway response shape');
    } catch (error) {
      if (options.onError) {
        await options.onError(error, request, response);
      }

      return response.status(503).json({
        error: 'RLAAS_UNAVAILABLE',
        message: error instanceof Error ? error.message : 'RLaaS middleware failed',
      });
    }
  };
}

export type {
  GatewayCheckRequest,
  GatewayCheckResponse,
  RlaasErrorResponse,
} from '@rlaas/shared';
