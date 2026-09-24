import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { REQUEST_LOG_RETENTION_MS } from './request-log-retention.constants';

/** Rows per DELETE. Each batch is its own short autocommit transaction. */
const BATCH_SIZE = 5_000;
/** Pause between batches so replication and vacuum keep pace. */
const PAUSE_MS = 250;
/**
 * Upper bound per run (5,000 x 2,000 = 10M rows). A backlog bigger than that
 * is finished by later runs rather than one run holding the database for hours.
 */
const MAX_BATCHES = 2_000;

const LOCK_KEY = 'rlaas:retention:request-logs:lock';
/** Longer than any run can take at MAX_BATCHES, so a crash self-heals. */
const LOCK_TTL_SECONDS = 60 * 60;
export const LAST_RUN_KEY = 'rlaas:retention:request-logs:last-run';

/** Delete the lock only if this run still holds it. */
const RELEASE_LOCK = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0
`;

export interface PurgeResult {
  status: 'completed' | 'capped' | 'skipped-locked';
  cutoff: Date;
  deleted: number;
  batches: number;
  durationMs: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Deletes request_logs rows older than REQUEST_LOG_RETENTION_DAYS.
 *
 * Missed runs are harmless by construction: the cutoff is always "now minus the
 * retention window", so whichever run fires next deletes everything past it,
 * however long it has been. The first run after deploy works through the
 * backlog the same way, in the same batches; there is no separate backfill.
 *
 * Each batch is one `DELETE ... WHERE id IN (SELECT id ... LIMIT n)`, served by
 * request_logs_created_at_brin_idx and committed on its own, so no lock is held
 * across batches and the gateway's INSERTs never wait long.
 */
@Injectable()
export class RequestLogRetentionService {
  private readonly logger = new Logger(RequestLogRetentionService.name);
  private running = false;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  /** The cutoff a run started now would use. */
  cutoff(now = Date.now()): Date {
    return new Date(now - REQUEST_LOG_RETENTION_MS);
  }

  /** Rows a run started now would delete. For dry runs and verification. */
  async countExpired(): Promise<{ cutoff: Date; expired: number }> {
    const cutoff = this.cutoff();
    const expired = await this.prismaService.requestLog.count({
      where: { createdAt: { lt: cutoff } },
    });
    return { cutoff, expired };
  }

  async purgeExpired(): Promise<PurgeResult> {
    const startedAt = Date.now();
    // Fixed for the whole run, so the run terminates even while new rows keep
    // crossing the line; those belong to the next run.
    const cutoff = this.cutoff(startedAt);

    if (this.running) {
      return this.skipped(cutoff, startedAt, 'this process is already running it');
    }
    // Claimed before the first await. Setting it after acquireLock left a gap
    // in which a second trigger (cron firing during the boot catch-up) passed
    // the check too and ran a parallel loop.
    this.running = true;

    const token = randomUUID();
    let lock: Awaited<ReturnType<typeof this.acquireLock>>;
    try {
      lock = await this.acquireLock(token);
    } catch (error) {
      this.running = false;
      throw error;
    }
    if (lock === 'held-elsewhere') {
      this.running = false;
      return this.skipped(cutoff, startedAt, 'another instance holds the lock');
    }

    let deleted = 0;
    let batches = 0;
    let capped = false;

    try {
      for (;;) {
        const removed = await this.prismaService.$executeRaw`
          DELETE FROM "request_logs"
          WHERE "id" IN (
            SELECT "id" FROM "request_logs"
            WHERE "created_at" < ${cutoff}
            LIMIT ${BATCH_SIZE}
          )`;

        batches += 1;
        deleted += removed;

        // `!(removed >= BATCH_SIZE)` rather than `removed < BATCH_SIZE`, so a
        // non-numeric result ends the run instead of looping forever.
        if (!(removed >= BATCH_SIZE)) break;
        if (batches >= MAX_BATCHES) {
          capped = true;
          break;
        }
        await sleep(PAUSE_MS);
      }
    } finally {
      this.running = false;
      if (lock === 'acquired') await this.releaseLock(token);
    }

    const result: PurgeResult = {
      status: capped ? 'capped' : 'completed',
      cutoff,
      deleted,
      batches,
      durationMs: Date.now() - startedAt,
    };

    await this.recordRun(result);

    this.logger.log(
      `request_logs retention ${result.status}: deleted=${deleted} batches=${batches} ` +
        `cutoff=${cutoff.toISOString()} durationMs=${result.durationMs}` +
        (capped ? ` (stopped at ${MAX_BATCHES} batches; the next run continues)` : ''),
    );

    return result;
  }

  /** When the last completed or capped run finished, or null if never. */
  async lastRunAt(): Promise<Date | null> {
    try {
      const raw = await this.redisService.getClient().get(LAST_RUN_KEY);
      if (!raw) return null;
      const finishedAt = (JSON.parse(raw) as { finishedAt?: string }).finishedAt;
      return finishedAt ? new Date(finishedAt) : null;
    } catch {
      /* non-critical: treat as unknown, which triggers a (harmless) run */
      return null;
    }
  }

  private skipped(cutoff: Date, startedAt: number, why: string): PurgeResult {
    this.logger.log(`request_logs retention skipped: ${why}`);
    return {
      status: 'skipped-locked',
      cutoff,
      deleted: 0,
      batches: 0,
      durationMs: Date.now() - startedAt,
    };
  }

  /**
   * Redis lock so two instances (or a manual run beside the scheduler) do not
   * delete side by side. Overlap would be harmless, since both issue the same
   * idempotent DELETEs, just wasteful. So a Redis outage degrades to running
   * without the lock rather than skipping retention.
   */
  private async acquireLock(token: string): Promise<'acquired' | 'held-elsewhere' | 'unavailable'> {
    try {
      const claimed = await this.redisService
        .getClient()
        .set(LOCK_KEY, token, 'EX', LOCK_TTL_SECONDS, 'NX');
      return claimed === 'OK' ? 'acquired' : 'held-elsewhere';
    } catch (error) {
      this.logger.warn(
        `Retention lock unavailable, running without it: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 'unavailable';
    }
  }

  private async releaseLock(token: string) {
    try {
      await this.redisService.getClient().eval(RELEASE_LOCK, 1, LOCK_KEY, token);
    } catch { /* non-critical: the TTL expires it */ }
  }

  private async recordRun(result: PurgeResult) {
    try {
      await this.redisService.getClient().set(
        LAST_RUN_KEY,
        JSON.stringify({
          finishedAt: new Date().toISOString(),
          status: result.status,
          deleted: result.deleted,
          batches: result.batches,
          cutoff: result.cutoff.toISOString(),
        }),
      );
    } catch { /* non-critical: at worst the next boot runs again */ }
  }
}
