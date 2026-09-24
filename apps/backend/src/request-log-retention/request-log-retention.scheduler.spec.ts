import { RequestLogRetentionScheduler } from './request-log-retention.scheduler';
import { RequestLogRetentionService } from './request-log-retention.service';

describe('RequestLogRetentionScheduler', () => {
  const NOW = new Date('2026-09-24T10:00:00.000Z').getTime();
  const HOUR = 60 * 60 * 1000;

  const purgeExpired = jest.fn();
  const lastRunAt = jest.fn();
  const retention = { purgeExpired, lastRunAt } as unknown as RequestLogRetentionService;

  let scheduler: RequestLogRetentionScheduler;

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    purgeExpired.mockReset().mockResolvedValue({ status: 'completed' });
    lastRunAt.mockReset();
    scheduler = new RequestLogRetentionScheduler(retention);
  });

  afterEach(() => {
    scheduler.onApplicationShutdown();
    jest.useRealTimers();
  });

  /** Fire the 60s boot timer and let the async check settle. */
  const boot = async () => {
    scheduler.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(60_000);
  };

  it('runs a catch-up shortly after boot when retention has never run', async () => {
    lastRunAt.mockResolvedValue(null);

    scheduler.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(59_000);
    expect(purgeExpired).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1_000);
    expect(purgeExpired).toHaveBeenCalledTimes(1);
  });

  it('runs a catch-up when the last run is more than a day old', async () => {
    lastRunAt.mockResolvedValue(new Date(NOW - 25 * HOUR));

    await boot();

    expect(purgeExpired).toHaveBeenCalledTimes(1);
  });

  it('does not run on boot when the last run is recent', async () => {
    lastRunAt.mockResolvedValue(new Date(NOW - 2 * HOUR));

    await boot();

    expect(purgeExpired).not.toHaveBeenCalled();
  });

  it('does not run the catch-up if the app shuts down first', async () => {
    lastRunAt.mockResolvedValue(null);

    scheduler.onApplicationBootstrap();
    scheduler.onApplicationShutdown();
    await jest.advanceTimersByTimeAsync(60_000);

    expect(lastRunAt).not.toHaveBeenCalled();
    expect(purgeExpired).not.toHaveBeenCalled();
  });

  it('catches a failed run instead of leaving an unhandled rejection', async () => {
    purgeExpired.mockRejectedValue(new Error('db down'));
    const logError = jest
      .spyOn((scheduler as unknown as { logger: { error: () => void } }).logger, 'error')
      .mockImplementation(() => undefined);

    scheduler.daily();
    await jest.advanceTimersByTimeAsync(0);

    expect(logError).toHaveBeenCalledWith(
      'request_logs retention failed (daily schedule)',
      expect.stringContaining('db down'),
    );
  });
});
