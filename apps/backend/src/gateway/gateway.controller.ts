import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AlgorithmRegistryService } from '../algorithms/algorithm-registry.service';
import { RateLimiterService } from '../rate-limiter/rate-limiter.service';
import { DemoCheckDto } from './dto/demo-check.dto';
import { GatewayCheckDto } from './dto/gateway-check.dto';

const DEMO_LIMIT = 5;
const DEMO_WINDOW_SECONDS = 10;

@ApiTags('gateway')
@Controller({ path: 'gateway', version: '1' })
export class GatewayController {
  constructor(
    private readonly rateLimiterService: RateLimiterService,
    private readonly algorithmRegistry: AlgorithmRegistryService,
  ) {}

  @Post('check')
  @ApiOperation({ summary: 'Check whether a request should be allowed' })
  check(@Body() dto: GatewayCheckDto) {
    return this.rateLimiterService.checkRequest(dto);
  }

  @Post('demo-check')
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

    return {
      allowed: result.allowed,
      algorithm: result.algorithm,
      limit: DEMO_LIMIT,
      remaining: result.remaining,
      resetInMs: result.retryAfter > 0 ? result.retryAfter * 1000 : 0,
      retryAfterMs: result.allowed ? null : result.retryAfter * 1000,
      timestamp: new Date().toISOString(),
    };
  }
}
