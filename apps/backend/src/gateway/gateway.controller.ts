import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { AlgorithmRegistryService } from '../algorithms/algorithm-registry.service';
import { RateLimitAlgorithm } from '../algorithms/algorithm.enum';
import { Public } from '../auth/decorators/public.decorator';
import { GatewayCheckResult } from '../rate-limiter/interfaces/gateway-check-result.interface';
import { RateLimiterService } from '../rate-limiter/rate-limiter.service';
import { DemoCheckDto } from './dto/demo-check.dto';
import { GatewayCheckDto } from './dto/gateway-check.dto';
import { DemoThrottlerGuard } from './guards/demo-throttler.guard';

const DEMO_LIMIT = 5;
const DEMO_WINDOW_SECONDS = 10;

/**
 * RLaaS's public endpoint. Returns HTTP 200 with `{ allowed: true, ... }` when
 * the request is permitted, HTTP 429 with `{ allowed: false, reason, ... }`
 * when it is not. The body always carries `limit`, `remaining`, `retryAfter`.
 *
 * A client must treat a 429 that carries `allowed: false` as a decision, not a
 * failure. The express SDK did not, and turned every block into a 503; it now
 * does (packages/express-sdk/src/index.ts).
 *
 * No built-in IP throttle on /check: its traffic control is the project's own
 * rate-limit rules. Only /demo-check, which is unauthenticated, carries a
 * per-IP budget (DemoThrottlerGuard, 30/min). A throttled demo request gets a
 * 429 with the standard error envelope and no `allowed` field.
 */
@Public()
@ApiTags('gateway')
@Controller({ path: 'gateway', version: '1' })
export class GatewayController {
  constructor(
    private readonly rateLimiterService: RateLimiterService,
    private readonly algorithmRegistry: AlgorithmRegistryService,
  ) {}

  @Post('check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check whether a request should be allowed' })
  async check(@Body() dto: GatewayCheckDto) {
    const result = await this.rateLimiterService.checkRequest(dto);

    if (!result.allowed) {
      throw new GatewayBlockedException(result);
    }

    return result;
  }

  @Post('demo-check')
  @HttpCode(HttpStatus.OK)
  @UseGuards(DemoThrottlerGuard)
  @SkipThrottle({ auth: true })
  @ApiOperation({ summary: 'Public demo rate limit check — no auth required' })
  async demoCheck(@Body() dto: DemoCheckDto) {
    const key = `demo:${dto.identifier}:${dto.algorithm}`;
    const handler = this.algorithmRegistry.get(dto.algorithm);

    const result = await handler.consume({
      key,
      limit: DEMO_LIMIT,
      windowSeconds: DEMO_WINDOW_SECONDS,
      algorithm: dto.algorithm,
    });

    if (!result.allowed) {
      throw new GatewayBlockedException({
        allowed: false,
        reason: 'RATE_LIMIT_EXCEEDED',
        algorithm: result.algorithm ?? RateLimitAlgorithm.FIXED_WINDOW,
        limit: DEMO_LIMIT,
        remaining: 0,
        retryAfter: result.retryAfter,
      });
    }

    return {
      allowed: true,
      algorithm: result.algorithm,
      limit: DEMO_LIMIT,
      remaining: result.remaining,
      retryAfter: 0,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Local 429 that carries the rate-limit decision through `HttpExceptionFilter`.
 * The filter is responsible for setting `Retry-After` and the `X-RateLimit-*`
 * headers from the payload.
 */
class GatewayBlockedException extends HttpException {
  constructor(payload: GatewayCheckResult) {
    super(payload, HttpStatus.TOO_MANY_REQUESTS);
  }
}
