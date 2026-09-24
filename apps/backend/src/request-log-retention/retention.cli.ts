import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { validateEnv } from '../config/env.validation';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { RequestLogRetentionService } from './request-log-retention.service';

/**
 * Manual request_logs retention run, outside the web process.
 *
 *   pnpm --filter @rlaas/backend retention:run -- --dry-run   # count only
 *   pnpm --filter @rlaas/backend retention:run                # delete
 *
 * Runs against whatever DATABASE_URL / REDIS_URL the environment points at,
 * which in apps/backend/.env is production. It takes the same Redis lock as
 * the scheduled job, so it never deletes side by side with it.
 *
 * Boots only config, Prisma and Redis: no ScheduleModule, so no cron fires and
 * no boot catch-up starts inside this process.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validate: validateEnv,
    }),
    PrismaModule,
    RedisModule,
  ],
  providers: [RequestLogRetentionService],
})
class RetentionCliModule {}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const logger = new Logger('RetentionCli');
  const app = await NestFactory.createApplicationContext(RetentionCliModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const retention = app.get(RequestLogRetentionService);

    if (dryRun) {
      const { cutoff, expired } = await retention.countExpired();
      logger.log(`dry run: ${expired} row(s) older than ${cutoff.toISOString()} would be deleted`);
      return;
    }

    const result = await retention.purgeExpired();
    if (result.status === 'skipped-locked') process.exitCode = 2;
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
