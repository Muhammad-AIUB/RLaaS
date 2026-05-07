import { Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { RateLimitAlgorithm } from '../algorithm.enum';
import { RateLimitAlgorithmHandler } from '../interfaces/rate-limit-algorithm.interface';
import { RateLimitParams } from '../interfaces/rate-limit-params.interface';
import { RateLimitResult } from '../interfaces/rate-limit-result.interface';

const TOKEN_BUCKET_LUA_SCRIPT = `
local key = KEYS[1]
local nowMs = tonumber(ARGV[1])
local capacity = tonumber(ARGV[2])
local refillRate = tonumber(ARGV[3])
local ttlMs = tonumber(ARGV[4])

local data = redis.call('HMGET', key, 'tokens', 'updatedAt')
local tokens = tonumber(data[1])
local updatedAt = tonumber(data[2])

if tokens == nil then
  tokens = capacity
  updatedAt = nowMs
end

local elapsedMs = math.max(nowMs - updatedAt, 0)
local replenished = elapsedMs * refillRate / 1000
tokens = math.min(capacity, tokens + replenished)

local allowed = 0
local retryAfterMs = 0

if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
else
  retryAfterMs = math.ceil(((1 - tokens) / refillRate) * 1000)
end

redis.call('HSET', key, 'tokens', tokens, 'updatedAt', nowMs)
redis.call('PEXPIRE', key, ttlMs)

return {allowed, tokens, retryAfterMs}
`;

@Injectable()
export class TokenBucketAlgorithmService implements RateLimitAlgorithmHandler {
  readonly algorithm = RateLimitAlgorithm.TOKEN_BUCKET;

  constructor(private readonly redisService: RedisService) {}

  async consume(params: RateLimitParams): Promise<RateLimitResult> {
    const { key, limit, windowSeconds } = params;
    const nowMs = params.nowMs ?? Date.now();
    const refillRate = limit / windowSeconds;
    const ttlMs = Math.ceil(windowSeconds * 2000);

    const result = (await this.redisService.getClient().eval(
      TOKEN_BUCKET_LUA_SCRIPT,
      1,
      key,
      nowMs,
      limit,
      refillRate,
      ttlMs,
    )) as [number | string, number | string, number | string];

    const allowed = Number(result[0]) === 1;
    const tokensRemaining = Math.max(Math.floor(Number(result[1])), 0);
    const retryAfterMs = Math.max(Number(result[2]), 0);

    return {
      allowed,
      limit,
      remaining: allowed ? tokensRemaining : 0,
      retryAfter: Math.ceil(retryAfterMs / 1000),
      algorithm: this.algorithm,
    };
  }
}
