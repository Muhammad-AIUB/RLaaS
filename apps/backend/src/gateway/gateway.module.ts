import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AlgorithmsModule } from '../algorithms/algorithms.module';
import { RequestTimingMiddleware } from '../common/middleware/request-timing.middleware';
import { RateLimiterModule } from '../rate-limiter/rate-limiter.module';
import { GatewayController } from './gateway.controller';

@Module({
  imports: [RateLimiterModule, AlgorithmsModule],
  controllers: [GatewayController],
})
export class GatewayModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestTimingMiddleware).forRoutes(GatewayController);
  }
}
