import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { AlgorithmsModule } from '../algorithms/algorithms.module';
import { RulesModule } from '../rules/rules.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { RateLimiterService } from './rate-limiter.service';

@Module({
  imports: [
    ConfigModule,
    AlgorithmsModule,
    ApiKeysModule,
    RulesModule,
    WebhooksModule,
  ],
  providers: [RateLimiterService],
  exports: [RateLimiterService],
})
export class RateLimiterModule {}
