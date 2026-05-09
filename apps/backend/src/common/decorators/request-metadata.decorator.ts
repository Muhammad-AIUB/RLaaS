import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestMetadata } from '../interfaces/request-metadata.interface';

type HeaderMap = Record<string, string | string[] | undefined>;

export const RequestMeta = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestMetadata => {
    const request = context.switchToHttp().getRequest<{
      ip?: string;
      headers: HeaderMap;
    }>();

    const forwardedFor = request.headers['x-forwarded-for'];
    const forwardedIp = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor?.split(',')[0]?.trim();
    const requestId = request.headers['x-request-id'];
    const userAgent = request.headers['user-agent'];

    return {
      ipAddress: forwardedIp || request.ip,
      requestId: Array.isArray(requestId) ? requestId[0] : requestId,
      userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
    };
  },
);
