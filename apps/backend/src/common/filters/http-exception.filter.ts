import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Gateway decisions that arrive as 429 carry the limit / remaining / reset
 * numbers in the payload. Pull them out so HTTP-aware clients can react with
 * the standard machinery — `Retry-After`, `X-RateLimit-Limit`, etc.
 *
 * For `GatewayBlockedException` the response body must remain the raw
 * `GatewayCheckResult` shape, because the SDK reads it to drive its own
 * back-off. We detect that case by the presence of a `limit` field on the
 * payload and skip the standard `{ success, error }` wrapping.
 */
type RateLimitPayload = {
  retryAfter?: number;
  limit?: number;
  remaining?: number;
  reason?: string;
};

function asRateLimitPayload(value: unknown): RateLimitPayload | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const v = value as RateLimitPayload;
  if (
    typeof v.limit === 'number' ||
    typeof v.remaining === 'number' ||
    typeof v.retryAfter === 'number'
  ) {
    return v;
  }
  return null;
}

function isGatewayRateLimitPayload(value: unknown): boolean {
  const v = value as { allowed?: unknown; limit?: unknown } | null;
  return (
    !!v &&
    v.allowed === false &&
    typeof v.limit === 'number'
  );
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    /**
     * Anything that is not an HttpException reached here by accident, and the
     * client is being told nothing but "Internal server error" — correctly, it
     * must not see internals. So this is the only place the cause survives.
     *
     * 5xx from an explicit HttpException is logged too (someone threw
     * InternalServerErrorException on purpose and still wants to know); 4xx is
     * not, because client mistakes are not incidents.
     */
    if (!(exception instanceof HttpException)) {
      this.logger.error(
        `Unhandled ${
          exception instanceof Error ? exception.name : typeof exception
        } on ${request.method} ${request.url}: ${
          exception instanceof Error ? exception.message : String(exception)
        }`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${status} on ${request.method} ${request.url}: ${JSON.stringify(exceptionResponse)}`,
        exception.stack,
      );
    }

    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      const payload = asRateLimitPayload(exceptionResponse);

      if (payload) {
        if (typeof payload.limit === 'number') {
          response.setHeader('X-RateLimit-Limit', String(payload.limit));
          response.setHeader('RateLimit-Limit', String(payload.limit));
        }
        if (typeof payload.remaining === 'number') {
          response.setHeader(
            'X-RateLimit-Remaining',
            String(Math.max(payload.remaining, 0)),
          );
          response.setHeader(
            'RateLimit-Remaining',
            String(Math.max(payload.remaining, 0)),
          );
        }
        if (typeof payload.retryAfter === 'number' && payload.retryAfter > 0) {
          response.setHeader('Retry-After', String(payload.retryAfter));
          response.setHeader(
            'X-RateLimit-Reset',
            String(Math.ceil(payload.retryAfter)),
          );
        }
      }
    }

    /**
     * Gateway rate-limit responses are passed through with their native body
     * so the SDK can read the decision directly. Everything else is wrapped
     * in the standard envelope.
     */
    if (
      status === HttpStatus.TOO_MANY_REQUESTS &&
      isGatewayRateLimitPayload(exceptionResponse)
    ) {
      response.status(status).json(exceptionResponse);
      return;
    }

    const message =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : (exceptionResponse as { message?: unknown })?.message ??
          'Internal server error';

    response.status(status).json({
      success: false,
      error: {
        message,
        statusCode: status,
        path: request.url,
        timestamp: new Date().toISOString(),
      },
    });
  }
}
