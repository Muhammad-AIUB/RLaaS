import { Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { RateLimitAlgorithm } from '../algorithm.enum';
import { RateLimitAlgorithmHandler } from '../interfaces/rate-limit-algorithm.interface';
import { RateLimitParams } from '../interfaces/rate-limit-params.interface';
import { RateLimitResult } from '../interfaces/rate-limit-result.interface';

const SLIDING_WINDOW_LOG_LUA_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
local minScore = now - windowMs

redis.call('ZREMRANGEBYSCORE', key, 0, minScore)
local current = redis.call('ZCARD', key)

if current >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retryAfterMs = 0
  if oldest[2] then
    retryAfterMs = math.max(windowMs - (now - tonumber(oldest[2])), 0)
  end
  redis.call('PEXPIRE', key, windowMs)
  return {0, current, retryAfterMs}
end

redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, windowMs)
local updated = redis.call('ZCARD', key)
return {1, updated, 0}
`;

@Injectable()
export class SlidingWindowLogAlgorithmService
  implements RateLimitAlgorithmHandler
{
  readonly algorithm = RateLimitAlgorithm.SLIDING_WINDOW_LOG;

  constructor(private readonly redisService: RedisService) {}

  async consume(params: RateLimitParams): Promise<RateLimitResult> {
    const { key, limit, windowSeconds } = params;
    const nowMs = params.nowMs ?? Date.now();
    const member = `${nowMs}-${Math.random().toString(36).slice(2, 10)}`;

    const result = (await this.redisService.getClient().eval(
      SLIDING_WINDOW_LOG_LUA_SCRIPT,
      1,
      key,
      nowMs,
      windowSeconds * 1000,
      limit,
      member,
    )) as [number | string, number | string, number | string];

    const allowed = Number(result[0]) === 1;
    const count = Number(result[1]);
    const retryAfterMs = Number(result[2]);
    const remaining = allowed ? Math.max(limit - count, 0) : 0;

    return {
      allowed,
      limit,
      remaining,
      retryAfter: Math.ceil(retryAfterMs / 1000),
      algorithm: this.algorithm,
    };
  }
}
