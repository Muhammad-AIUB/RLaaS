import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { resolveClientIp } from '../../common/utils/client-ip.util';

/**
 * Per-IP throttle for POST /gateway/demo-check, the `demo` budget in
 * AuthModule's ThrottlerModule.forRoot (30 per minute).
 *
 * Only the demo route carries it. It is unauthenticated and mints a Redis key
 * per caller-supplied identifier, so it needs abuse protection that does not
 * depend on any customer's rules. /gateway/check deliberately has no built-in
 * IP ceiling: its traffic control is the project's own configured rules, and
 * the SDK calls it from the customer's server, so a per-IP cap there would
 * throttle a whole customer's traffic rather than any one abuser.
 *
 * Keyed on resolveClientIp for the same reason as AuthThrottlerGuard: the
 * default tracker (`req.ip`) can follow a caller-written `x-forwarded-for`,
 * which would hand every rotated header a fresh bucket.
 */
@Injectable()
export class DemoThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(request: Request): Promise<string> {
    return resolveClientIp(
      request.socket?.remoteAddress ?? request.ip,
      request.headers['x-forwarded-for'],
    );
  }
}
