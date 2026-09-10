import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { resolveClientIp } from '../../common/utils/client-ip.util';

/**
 * Per-IP throttle for the unauthenticated auth routes.
 *
 * WHY THE OVERRIDE
 *
 * ThrottlerGuard's default tracker is `req.ip`, which under Express means
 * "socket address, unless `trust proxy` is set, in which case a leftmost-ish
 * entry of `x-forwarded-for`". A throttle keyed on something the caller can
 * change is not a throttle: rotating one header would hand every request a
 * fresh bucket, which is exactly the bypass this guard exists to stop.
 *
 * So it keys on the same resolver the rest of the app now uses — counting in
 * from the right of the forwarded chain by the configured trusted hop count,
 * and ignoring the header entirely when that count is 0.
 *
 * See common/utils/client-ip.util.ts for the full reasoning.
 */
@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(request: Request): Promise<string> {
    return resolveClientIp(
      request.socket?.remoteAddress ?? request.ip,
      request.headers['x-forwarded-for'],
    );
  }
}
