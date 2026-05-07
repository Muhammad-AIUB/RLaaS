import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import { CreateSnapshotDto } from './dto/create-snapshot.dto';
import { AnalyticsService } from './analytics.service';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get dashboard overview metrics for a project' })
  getOverview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.getOverview(user.sub, projectId, query);
  }

  @Get('top-ips')
  @ApiOperation({ summary: 'Get top offending IPs for a project' })
  getTopIps(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.getTopIps(user.sub, projectId, query);
  }

  @Get('top-endpoints')
  @ApiOperation({ summary: 'Get most used endpoints for a project' })
  getTopEndpoints(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.getTopEndpoints(user.sub, projectId, query);
  }

  @Get('algorithms')
  @ApiOperation({ summary: 'Get algorithm performance comparison for a project' })
  getAlgorithmPerformance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.getAlgorithmPerformance(
      user.sub,
      projectId,
      query,
    );
  }

  @Get('logs')
  @ApiOperation({ summary: 'Get recent request logs for a project' })
  getRecentLogs(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.getRecentLogs(user.sub, projectId, query);
  }

  @Post('snapshots')
  @ApiOperation({ summary: 'Generate or refresh an analytics snapshot' })
  createSnapshot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateSnapshotDto,
  ) {
    return this.analyticsService.createSnapshot(user.sub, projectId, dto);
  }

  @Get('snapshots')
  @ApiOperation({ summary: 'List saved analytics snapshots for a project' })
  listSnapshots(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.listSnapshots(user.sub, projectId, query);
  }
}
