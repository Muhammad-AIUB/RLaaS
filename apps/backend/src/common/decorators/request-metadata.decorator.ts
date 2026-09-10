import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestMetadata } from '../interfaces/request-metadata.interface';
import { resolveClientIp } from '../utils/client-ip.util';

type HeaderMap = Record<string, string | string[] | undefined>;

export const RequestMeta = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestMetadata => {
    const request = context.switchToHttp().getRequest<{
      ip?: string;
      socket?: { remoteAddress?: string };
      headers: HeaderMap;
    }>();

    const requestId = request.headers['x-request-id'];
    const userAgent = request.headers['user-agent'];

    return {
      /**
       * This used to be `forwardedIp || request.ip`, taking the leftmost
       * `x-forwarded-for` entry — the one the caller writes. Audit rows are
       * the record of who did what, and their source address was supplied by
       * the person being recorded. See common/utils/client-ip.util.ts.
       */
      ipAddress: resolveClientIp(
        request.socket?.remoteAddress ?? request.ip,
        request.headers['x-forwarded-for'],
      ),
      requestId: Array.isArray(requestId) ? requestId[0] : requestId,
      userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
    };
  },
);
