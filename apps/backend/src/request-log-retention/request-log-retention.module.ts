import { Module } from '@nestjs/common';
import { RequestLogRetentionScheduler } from './request-log-retention.scheduler';
import { RequestLogRetentionService } from './request-log-retention.service';

/**
 * Scheduled deletion of request_logs rows past REQUEST_LOG_RETENTION_DAYS.
 * PrismaModule and RedisModule are global. The @Cron trigger needs
 * ScheduleModule.forRoot(), which AppModule registers.
 */
@Module({
  providers: [RequestLogRetentionService, RequestLogRetentionScheduler],
  exports: [RequestLogRetentionService],
})
export class RequestLogRetentionModule {}
