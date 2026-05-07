import { Module } from '@nestjs/common';
import { RateLimiterModule } from '../rate-limiter/rate-limiter.module';
import { GatewayController } from './gateway.controller';

@Module({
  imports: [RateLimiterModule],
  controllers: [GatewayController],
})
export class GatewayModule {}
