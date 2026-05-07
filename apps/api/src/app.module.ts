import { Module } from '@nestjs/common';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuditModule } from './audit/audit.module';
import { ConfigModule } from '@nestjs/config';
import { AlgorithmsModule } from './algorithms/algorithms.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { AuthModule } from './auth/auth.module';
import { GatewayModule } from './gateway/gateway.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { RateLimiterModule } from './rate-limiter/rate-limiter.module';
import { RedisModule } from './redis/redis.module';
import { RulesModule } from './rules/rules.module';
import { UsersModule } from './users/users.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    PrismaModule,
    RedisModule,
    AlgorithmsModule,
    AnalyticsModule,
    AuditModule,
    UsersModule,
    AuthModule,
    ProjectsModule,
    ApiKeysModule,
    RulesModule,
    WebhooksModule,
    RateLimiterModule,
    GatewayModule,
    HealthModule,
  ],
})
export class AppModule {}
