import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, seconds } from '@nestjs/throttler';
import { AlgorithmRegistryService } from '../algorithms/algorithm-registry.service';
import { RateLimitAlgorithm } from '../algorithms/algorithm.enum';
import { Public } from '../auth/decorators/public.decorator';
import { GatewayCheckResult } from '../rate-limiter/interfaces/gateway-check-result.interface';
import { RateLimiterService } from '../rate-limiter/rate-limiter.service';
import { DemoCheckDto } from './dto/demo-check.dto';
import { GatewayCheckDto } from './dto/gateway-check.dto';

const DEMO_LIMIT = 5;
const DEMO_WINDOW_SECONDS = 10;

/**
 * RLaaS's public endpoint. Returns HTTP 200 with `{ allowed: true, ... }` when
 * the request is permitted, HTTP 429 with `{ allowed: false, reason, ... }`
 * when it is not. The body always carries `limit`, `remaining`, `retryAfter`
 * so an SDK that ignores status codes keeps working.
 *
 * Per-IP throttling is applied at the handler so the global throttler keys on
 * the trusted IP (not the API key id) — an attacker cannot rotate identifiers
 * to bypass the limit.
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
  @Throttle({
    gateway: {
      ttl: seconds(1),
      limit: 200,
    },
  })
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
  @Throttle({
    gateway: {
      ttl: seconds(60),
      limit: 30,
    },
  })
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
