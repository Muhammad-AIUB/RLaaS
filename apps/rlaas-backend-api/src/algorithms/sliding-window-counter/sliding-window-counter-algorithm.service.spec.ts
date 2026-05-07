import { RedisService } from '../../redis/redis.service';
import { RateLimitAlgorithm } from '../algorithm.enum';
import { SlidingWindowCounterAlgorithmService } from './sliding-window-counter-algorithm.service';

describe('SlidingWindowCounterAlgorithmService', () => {
  const evalMock = jest.fn();
  const redisService = {
    getClient: () => ({
      eval: evalMock,
    }),
  } as unknown as RedisService;

  const service = new SlidingWindowCounterAlgorithmService(redisService);

  beforeEach(() => {
    evalMock.mockReset();
  });

  it('allows requests when the weighted estimate is under the limit', async () => {
    evalMock.mockResolvedValue([1, 25.2, 41000]);

    await expect(
      service.consume({
        key: 'rate-limit:key',
        limit: 100,
        windowSeconds: 60,
        algorithm: RateLimitAlgorithm.SLIDING_WINDOW_COUNTER,
        nowMs: 61000,
      }),
    ).resolves.toEqual({
      allowed: true,
      limit: 100,
      remaining: 74,
      retryAfter: 0,
      algorithm: RateLimitAlgorithm.SLIDING_WINDOW_COUNTER,
    });
  });

  it('blocks requests when the weighted estimate exceeds the limit', async () => {
    evalMock.mockResolvedValue([0, 100.4, 18000]);

    await expect(
      service.consume({
        key: 'rate-limit:key',
        limit: 100,
        windowSeconds: 60,
        algorithm: RateLimitAlgorithm.SLIDING_WINDOW_COUNTER,
        nowMs: 61000,
      }),
    ).resolves.toEqual({
      allowed: false,
      limit: 100,
      remaining: 0,
      retryAfter: 18,
      algorithm: RateLimitAlgorithm.SLIDING_WINDOW_COUNTER,
    });
  });
});
