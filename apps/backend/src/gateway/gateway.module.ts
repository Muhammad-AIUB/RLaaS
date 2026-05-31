import { Module } from '@nestjs/common';
import { AlgorithmsModule } from '../algorithms/algorithms.module';
import { RateLimiterModule } from '../rate-limiter/rate-limiter.module';
import { GatewayController } from './gateway.controller';

@Module({
  imports: [RateLimiterModule, AlgorithmsModule],
  controllers: [GatewayController],
})
export class GatewayModule {}
