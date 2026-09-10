import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type {
  GatewayCheckRequest,
  GatewayCheckResponse,
  RlaasErrorResponse,
} from '@rlaas/shared-types';

export interface CreateRlaasMiddlewareOptions {
  apiKey: string;
  gatewayUrl: string;
  userTierResolver?: (request: Request) => string | Promise<string>;
  ipResolver?: (request: Request) => string;
  /**
   * How many proxies sit between the internet and this app.
   *
   * 0 (the default) means the socket address is used and `x-forwarded-for` is
   * ignored. Set it to the real number of hops when you run behind a load
   * balancer or CDN — 1 for a single nginx/ALB/Render/Cloudflare in front.
   *
   * Getting this too low collapses clients onto the proxy address and limits
   * them together. Too high hands every client a limit bypass. When in doubt,
   * too low.
   */
  trustProxyHops?: number;
  fetchImpl?: typeof fetch;
  onError?: (
    error: unknown,
    request: Request,
    response: Response,
  ) => void | Promise<void>;
}

/**
 * Resolves the client IP without trusting the client.
 *
 * This used to read `x-forwarded-for` and return `split(',')[0]` — the
 * LEFTMOST entry — before ever looking at the socket, and to consult
 * `cf-connecting-ip` only as a second choice. Both are request headers, so any
 * caller could name its own address:
 *
 *     curl https://your-app/products -H 'X-Forwarded-For: 198.51.100.5'
 *
 * The value is sent to the gateway, where it selects the matching rule and
 * keys its counter. So a rule with `scope: IP` limited nothing (rotate the
 * header, get a fresh budget), and an IP rule granting a partner address a
 * high limit was claimable by anyone, since IP outranks every other scope.
 *
 * Setting Express's `trust proxy` did not help, because `req.ip` was never
 * reached. And the common proxies APPEND rather than replace
 * (nginx `$proxy_add_x_forwarded_for`, AWS ALB, Render), so the injected value
 * kept the leftmost slot.
 *
 * The chain is now read from the RIGHT: the last entry was written by the
 * proxy nearest this app and is the only one it can vouch for. With N trusted
 * hops the client is the (N+1)-th from the right.
 */
export function resolveIp(request: Request, trustProxyHops = 0): string {
  const socketIp =
    request.socket?.remoteAddress ??
    request.connection?.remoteAddress ??
    '127.0.0.1';

  if (trustProxyHops <= 0) {
    return socketIp;
  }

  const forwarded = request.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded.join(',') : forwarded;

  const chain = (raw ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  // A chain shorter than the configured hop count means the request did not
  // arrive through the expected path. Fall back rather than pick an entry the
  // caller may have written.
  if (chain.length < trustProxyHops) {
    return socketIp;
  }

  return chain[chain.length - trustProxyHops] ?? socketIp;
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
        ip:
          options.ipResolver?.(request) ??
          resolveIp(request, options.trustProxyHops ?? 0),
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
} from '@rlaas/shared-types';
