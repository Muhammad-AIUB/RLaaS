import { RedisService } from '../../redis/redis.service';
import { RateLimitAlgorithm } from '../algorithm.enum';
import { SlidingWindowLogAlgorithmService } from './sliding-window-log-algorithm.service';

describe('SlidingWindowLogAlgorithmService', () => {
  const evalMock = jest.fn();
  const redisService = {
    getClient: () => ({
      eval: evalMock,
    }),
  } as unknown as RedisService;

  const service = new SlidingWindowLogAlgorithmService(redisService);

  beforeEach(() => {
    evalMock.mockReset();
  });

  it('allows requests while the sorted set count is below the limit', async () => {
    evalMock.mockResolvedValue([1, 8, 0]);

    await expect(
      service.consume({
        key: 'rate-limit:key',
        limit: 10,
        windowSeconds: 60,
        algorithm: RateLimitAlgorithm.SLIDING_WINDOW_LOG,
        nowMs: 1000,
      }),
    ).resolves.toEqual({
      allowed: true,
      limit: 10,
      remaining: 2,
      retryAfter: 0,
      algorithm: RateLimitAlgorithm.SLIDING_WINDOW_LOG,
    });
  });

  it('blocks requests when the window log is full', async () => {
    evalMock.mockResolvedValue([0, 10, 3200]);

    await expect(
      service.consume({
        key: 'rate-limit:key',
        limit: 10,
        windowSeconds: 60,
        algorithm: RateLimitAlgorithm.SLIDING_WINDOW_LOG,
        nowMs: 1000,
      }),
    ).resolves.toEqual({
      allowed: false,
      limit: 10,
      remaining: 0,
      retryAfter: 4,
      algorithm: RateLimitAlgorithm.SLIDING_WINDOW_LOG,
    });
  });
});
