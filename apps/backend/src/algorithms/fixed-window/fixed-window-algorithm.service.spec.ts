import { RedisService } from '../../redis/redis.service';
import { RateLimitAlgorithm } from '../algorithm.enum';
import { FixedWindowAlgorithmService } from './fixed-window-algorithm.service';

describe('FixedWindowAlgorithmService', () => {
  const evalMock = jest.fn();
  const redisService = {
    getClient: () => ({
      eval: evalMock,
    }),
  } as unknown as RedisService;

  const service = new FixedWindowAlgorithmService(redisService);

  beforeEach(() => {
    evalMock.mockReset();
  });

  it('allows requests under the configured limit', async () => {
    evalMock.mockResolvedValue([12, 34]);

    await expect(
      service.consume({
        key: 'rate-limit:key',
        limit: 100,
        windowSeconds: 60,
        algorithm: RateLimitAlgorithm.FIXED_WINDOW,
      }),
    ).resolves.toEqual({
      allowed: true,
      limit: 100,
      remaining: 88,
      retryAfter: 0,
      algorithm: RateLimitAlgorithm.FIXED_WINDOW,
    });
  });

  it('blocks requests after the limit is exceeded', async () => {
    evalMock.mockResolvedValue([101, 27]);

    await expect(
      service.consume({
        key: 'rate-limit:key',
        limit: 100,
        windowSeconds: 60,
        algorithm: RateLimitAlgorithm.FIXED_WINDOW,
      }),
    ).resolves.toEqual({
      allowed: false,
      limit: 100,
      remaining: 0,
      retryAfter: 27,
      algorithm: RateLimitAlgorithm.FIXED_WINDOW,
    });
  });
});
