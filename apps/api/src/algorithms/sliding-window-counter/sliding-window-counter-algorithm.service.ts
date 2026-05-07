import { Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { RateLimitAlgorithm } from '../algorithm.enum';
import { RateLimitAlgorithmHandler } from '../interfaces/rate-limit-algorithm.interface';
import { RateLimitParams } from '../interfaces/rate-limit-params.interface';
import { RateLimitResult } from '../interfaces/rate-limit-result.interface';

const SLIDING_WINDOW_COUNTER_LUA_SCRIPT = `
local currentKey = KEYS[1]
local previousKey = KEYS[2]
local limit = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local elapsedMs = tonumber(ARGV[3])

local currentCount = tonumber(redis.call('GET', currentKey) or '0')
local previousCount = tonumber(redis.call('GET', previousKey) or '0')
local weight = (windowMs - elapsedMs) / windowMs
if weight < 0 then
  weight = 0
end

local estimated = currentCount + (previousCount * weight)

if estimated + 1 > limit then
  local ttl = redis.call('PTTL', currentKey)
  if ttl < 0 then
    ttl = windowMs - elapsedMs
  end
  return {0, estimated, ttl}
end

currentCount = redis.call('INCR', currentKey)
redis.call('PEXPIRE', currentKey, windowMs * 2)
estimated = currentCount + (previousCount * weight)
local ttl = redis.call('PTTL', currentKey)
return {1, estimated, ttl}
`;

@Injectable()
export class SlidingWindowCounterAlgorithmService
  implements RateLimitAlgorithmHandler
{
  readonly algorithm = RateLimitAlgorithm.SLIDING_WINDOW_COUNTER;

  constructor(private readonly redisService: RedisService) {}

  async consume(params: RateLimitParams): Promise<RateLimitResult> {
    const { key, limit, windowSeconds } = params;
    const nowMs = params.nowMs ?? Date.now();
    const windowMs = windowSeconds * 1000;
    const currentWindow = Math.floor(nowMs / windowMs);
    const elapsedMs = nowMs % windowMs;
    const currentKey = `${key}:current:${currentWindow}`;
    const previousKey = `${key}:previous:${currentWindow - 1}`;

    const result = (await this.redisService.getClient().eval(
      SLIDING_WINDOW_COUNTER_LUA_SCRIPT,
      2,
      currentKey,
      previousKey,
      limit,
      windowMs,
      elapsedMs,
    )) as [number | string, number | string, number | string];

    const allowed = Number(result[0]) === 1;
    const estimatedCount = Number(result[1]);
    const retryAfterMs = Math.max(Number(result[2]), 0);
    const remaining = allowed
      ? Math.max(limit - Math.ceil(estimatedCount), 0)
      : 0;

    return {
      allowed,
      limit,
      remaining,
      retryAfter: allowed ? 0 : Math.ceil(retryAfterMs / 1000),
      algorithm: this.algorithm,
    };
  }
}
