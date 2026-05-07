import { Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { RateLimitAlgorithm } from '../algorithm.enum';
import { RateLimitAlgorithmHandler } from '../interfaces/rate-limit-algorithm.interface';
import { RateLimitParams } from '../interfaces/rate-limit-params.interface';
import { RateLimitResult } from '../interfaces/rate-limit-result.interface';

const FIXED_WINDOW_LUA_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[2])
end
local ttl = redis.call('TTL', KEYS[1])
return {current, ttl}
`;

@Injectable()
export class FixedWindowAlgorithmService implements RateLimitAlgorithmHandler {
  readonly algorithm = RateLimitAlgorithm.FIXED_WINDOW;

  constructor(private readonly redisService: RedisService) {}

  async consume(params: RateLimitParams): Promise<RateLimitResult> {
    const { key, limit, windowSeconds } = params;

    const result = (await this.redisService.getClient().eval(
      FIXED_WINDOW_LUA_SCRIPT,
      1,
      key,
      limit,
      windowSeconds,
    )) as [number | string, number | string];

    const current = Number(result[0]);
    const ttl = Math.max(Number(result[1]), 0);
    const allowed = current <= limit;
    const remaining = allowed ? Math.max(limit - current, 0) : 0;

    return {
      allowed,
      limit,
      remaining,
      retryAfter: allowed ? 0 : ttl,
      algorithm: this.algorithm,
    };
  }
}
