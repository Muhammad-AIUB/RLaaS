import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { LAST_RUN_KEY, RequestLogRetentionService } from './request-log-retention.service';

describe('RequestLogRetentionService', () => {
  const NOW = new Date('2026-09-24T21:00:00.000Z');
  const CUTOFF = new Date('2026-08-20T21:00:00.000Z'); // NOW - 35 days

  const executeRaw = jest.fn();
  const count = jest.fn();
  const redis = {
    set: jest.fn(),
    get: jest.fn(),
    eval: jest.fn(),
  };

  const prismaService = {
    $executeRaw: executeRaw,
    requestLog: { count },
  } as unknown as PrismaService;
  const redisService = { getClient: () => redis } as unknown as RedisService;

  let service: RequestLogRetentionService;

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW.getTime());
    executeRaw.mockReset();
    count.mockReset();
    redis.set.mockReset().mockResolvedValue('OK');
    redis.get.mockReset().mockResolvedValue(null);
    redis.eval.mockReset().mockResolvedValue(1);
    service = new RequestLogRetentionService(prismaService, redisService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** The values interpolated into the tagged-template DELETE: [cutoff, limit]. */
  const deleteValues = (call: number) => executeRaw.mock.calls[call].slice(1);

  it('deletes in 5,000-row batches until a short batch, with a fixed 35-day cutoff', async () => {
    executeRaw
      .mockResolvedValueOnce(5_000)
      .mockResolvedValueOnce(5_000)
      .mockResolvedValueOnce(12);

    const result = await service.purgeExpired();

    expect(result).toEqual({
      status: 'completed',
      cutoff: CUTOFF,
      deleted: 10_012,
      batches: 3,
      durationMs: expect.any(Number),
    });
    expect(executeRaw).toHaveBeenCalledTimes(3);
    for (let call = 0; call < 3; call += 1) {
      expect(deleteValues(call)).toEqual([CUTOFF, 5_000]);
    }
  });

  it('stops after one batch when nothing is past the cutoff', async () => {
    executeRaw.mockResolvedValueOnce(0);

    const result = await service.purgeExpired();

    expect(result.status).toBe('completed');
    expect(result.deleted).toBe(0);
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it('takes the lock with NX and a TTL, releases only its own token, and records the run', async () => {
    executeRaw.mockResolvedValueOnce(7);

    await service.purgeExpired();

    expect(redis.set).toHaveBeenCalledWith(
      'rlaas:retention:request-logs:lock',
      expect.any(String),
      'EX',
      3600,
      'NX',
    );
    const token = redis.set.mock.calls[0][1];
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('get', KEYS[1]) == ARGV[1]"),
      1,
      'rlaas:retention:request-logs:lock',
      token,
    );
    expect(redis.set).toHaveBeenCalledWith(LAST_RUN_KEY, expect.any(String));
    const recorded = JSON.parse(redis.set.mock.calls[1][1]);
    expect(recorded).toMatchObject({ status: 'completed', deleted: 7, batches: 1 });
  });

  it('skips without deleting when another instance holds the lock', async () => {
    redis.set.mockResolvedValueOnce(null);

    const result = await service.purgeExpired();

    expect(result.status).toBe('skipped-locked');
    expect(executeRaw).not.toHaveBeenCalled();
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('still runs, unlocked, when Redis is down', async () => {
    redis.set.mockRejectedValue(new Error('ECONNREFUSED'));
    executeRaw.mockResolvedValueOnce(3);

    const result = await service.purgeExpired();

    expect(result).toMatchObject({ status: 'completed', deleted: 3 });
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('releases the lock and can run again after a failed DELETE', async () => {
    executeRaw.mockRejectedValueOnce(new Error('connection reset'));

    await expect(service.purgeExpired()).rejects.toThrow('connection reset');
    expect(redis.eval).toHaveBeenCalledTimes(1);

    executeRaw.mockResolvedValueOnce(0);
    await expect(service.purgeExpired()).resolves.toMatchObject({ status: 'completed' });
  });

  it('refuses a second run in the same process while one is in flight', async () => {
    let finish!: (value: number) => void;
    executeRaw.mockReturnValueOnce(new Promise<number>((resolve) => (finish = resolve)));

    const first = service.purgeExpired();
    const second = await service.purgeExpired();
    finish(0);

    expect(second.status).toBe('skipped-locked');
    await expect(first).resolves.toMatchObject({ status: 'completed' });
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it('counts what a run would delete, for dry runs', async () => {
    count.mockResolvedValueOnce(507);

    await expect(service.countExpired()).resolves.toEqual({ cutoff: CUTOFF, expired: 507 });
    expect(count).toHaveBeenCalledWith({ where: { createdAt: { lt: CUTOFF } } });
  });

  it('reads the last run time, and treats a Redis failure as unknown', async () => {
    redis.get.mockResolvedValueOnce(JSON.stringify({ finishedAt: '2026-09-23T21:00:05.000Z' }));
    await expect(service.lastRunAt()).resolves.toEqual(new Date('2026-09-23T21:00:05.000Z'));

    redis.get.mockRejectedValueOnce(new Error('down'));
    await expect(service.lastRunAt()).resolves.toBeNull();
  });
});
