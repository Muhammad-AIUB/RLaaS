import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProjectRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { ProjectsService } from '../projects/projects.service';
import { AuditQueryDto } from './dto/audit-query.dto';
import { AuditService } from './audit.service';

@ApiTags('audit-logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'projects/:projectId/audit-logs', version: '1' })
export class AuditController {
  constructor(
    private readonly auditService: AuditService,
    private readonly projectsService: ProjectsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List sensitive audit log events for a project' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query() query: AuditQueryDto,
  ) {
    await this.projectsService.assertProjectAccess(user.sub, projectId, [
      ProjectRole.OWNER,
      ProjectRole.ADMIN,
    ]);

    return this.auditService.listProjectAuditLogs(projectId, query);
  }
}
