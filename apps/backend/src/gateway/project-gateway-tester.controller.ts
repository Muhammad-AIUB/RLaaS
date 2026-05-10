import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { PROJECT_READ_ROLES } from '../projects/projects.constants';
import { ProjectsService } from '../projects/projects.service';
import { RateLimiterService } from '../rate-limiter/rate-limiter.service';
import { ProjectGatewayCheckDto } from './dto/project-gateway-check.dto';

@ApiTags('gateway')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'projects/:projectId/gateway-tester', version: '1' })
export class ProjectGatewayTesterController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly rateLimiterService: RateLimiterService,
  ) {}

  @Post('check')
  @ApiOperation({ summary: 'Run a gateway check using a project API key' })
  async check(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: ProjectGatewayCheckDto,
  ) {
    await this.projectsService.assertProjectAccess(
      user.sub,
      projectId,
      PROJECT_READ_ROLES,
    );

    return this.rateLimiterService.checkProjectRequest(projectId, dto);
  }
}
