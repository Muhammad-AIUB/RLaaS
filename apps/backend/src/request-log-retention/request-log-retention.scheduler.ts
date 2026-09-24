import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RequestLogRetentionService } from './request-log-retention.service';

/**
 * 21:00 UTC = 03:00 in Asia/Dhaka (UTC+6), where this service's traffic lives.
 * Off-peak, not load-bearing: missed runs are harmless (see the service).
 */
const DAILY_AT = '0 21 * * *';

/** A boot catch-up runs if the last run is older than this. */
const OVERDUE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Let a cold start finish serving the request that woke it before the
 * catch-up competes for the same small instance and database.
 */
const BOOT_DELAY_MS = 60_000;

/**
 * Two triggers, because the host sleeps.
 *
 * The backend runs on Render's free plan, which stops the instance after 15
 * minutes without traffic, so an in-process cron only fires if the instance
 * happens to be awake at 21:00 UTC. The boot catch-up covers that: every
 * cold start checks when retention last ran and, if it has been more than a
 * day, runs it shortly after boot.
 *
 * That is enough because of where the rows come from. request_logs only grows
 * when /gateway/check serves traffic, and serving traffic means the instance
 * is awake, so booting and running the catch-up. A table that is not being
 * written to is not growing, and nothing is lost if it goes unpruned for a
 * while.
 */
@Injectable()
export class RequestLogRetentionScheduler
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(RequestLogRetentionScheduler.name);
  private bootTimer: NodeJS.Timeout | undefined;

  constructor(private readonly retention: RequestLogRetentionService) {}

  @Cron(DAILY_AT, { name: 'request-log-retention', timeZone: 'UTC' })
  daily(): void {
    this.launch('daily schedule');
  }

  onApplicationBootstrap(): void {
    this.bootTimer = setTimeout(() => {
      void this.catchUpIfOverdue().catch((error: unknown) =>
        this.logFailure('boot catch-up check', error),
      );
    }, BOOT_DELAY_MS);
    // Never keep the process alive (or a test runner open) just for this.
    this.bootTimer.unref();
  }

  onApplicationShutdown(): void {
    if (this.bootTimer) clearTimeout(this.bootTimer);
  }

  private async catchUpIfOverdue(): Promise<void> {
    const lastRunAt = await this.retention.lastRunAt();
    if (lastRunAt && Date.now() - lastRunAt.getTime() < OVERDUE_AFTER_MS) return;

    this.launch(
      lastRunAt ? `boot catch-up (last run ${lastRunAt.toISOString()})` : 'boot catch-up (never run)',
    );
  }

  /** Deferred work: launched with `void`, and its rejection is always caught. */
  private launch(trigger: string): void {
    this.logger.log(`request_logs retention starting: ${trigger}`);
    void this.retention.purgeExpired().catch((error: unknown) =>
      this.logFailure(trigger, error),
    );
  }

  private logFailure(trigger: string, error: unknown): void {
    this.logger.error(
      `request_logs retention failed (${trigger})`,
      error instanceof Error ? error.stack : String(error),
    );
  }
}
