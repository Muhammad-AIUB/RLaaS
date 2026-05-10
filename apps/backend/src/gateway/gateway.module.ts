import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { RateLimiterModule } from '../rate-limiter/rate-limiter.module';
import { GatewayController } from './gateway.controller';
import { ProjectGatewayTesterController } from './project-gateway-tester.controller';

@Module({
  imports: [ProjectsModule, RateLimiterModule],
  controllers: [GatewayController, ProjectGatewayTesterController],
})
export class GatewayModule {}
