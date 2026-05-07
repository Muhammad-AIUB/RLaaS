import { RedisService } from '../../redis/redis.service';
import { RateLimitAlgorithm } from '../algorithm.enum';
import { TokenBucketAlgorithmService } from './token-bucket-algorithm.service';

describe('TokenBucketAlgorithmService', () => {
  const evalMock = jest.fn();
  const redisService = {
    getClient: () => ({
      eval: evalMock,
    }),
  } as unknown as RedisService;

  const service = new TokenBucketAlgorithmService(redisService);

  beforeEach(() => {
    evalMock.mockReset();
  });

  it('allows requests when the bucket has tokens available', async () => {
    evalMock.mockResolvedValue([1, 88.9, 0]);

    await expect(
      service.consume({
        key: 'rate-limit:key',
        limit: 100,
        windowSeconds: 60,
        algorithm: RateLimitAlgorithm.TOKEN_BUCKET,
        nowMs: 1000,
      }),
    ).resolves.toEqual({
      allowed: true,
      limit: 100,
      remaining: 88,
      retryAfter: 0,
      algorithm: RateLimitAlgorithm.TOKEN_BUCKET,
    });
  });

  it('blocks requests when the bucket is empty', async () => {
    evalMock.mockResolvedValue([0, 0.3, 420]);

    await expect(
      service.consume({
        key: 'rate-limit:key',
        limit: 100,
        windowSeconds: 60,
        algorithm: RateLimitAlgorithm.TOKEN_BUCKET,
        nowMs: 1000,
      }),
    ).resolves.toEqual({
      allowed: false,
      limit: 100,
      remaining: 0,
      retryAfter: 1,
      algorithm: RateLimitAlgorithm.TOKEN_BUCKET,
    });
  });
});
