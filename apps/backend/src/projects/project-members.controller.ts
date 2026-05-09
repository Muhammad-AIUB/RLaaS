import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestMeta } from '../common/decorators/request-metadata.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import type { RequestMetadata } from '../common/interfaces/request-metadata.interface';
import { AddProjectMemberDto } from './dto/add-project-member.dto';
import { UpdateProjectMemberRoleDto } from './dto/update-project-member-role.dto';
import { ProjectsService } from './projects.service';

@ApiTags('project-members')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'projects/:projectId/members', version: '1' })
export class ProjectMembersController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @ApiOperation({ summary: 'List project members and roles' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ) {
    return this.projectsService.listMembers(user.sub, projectId);
  }

  @Post()
  @ApiOperation({ summary: 'Add a user to a project with a role' })
  add(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: AddProjectMemberDto,
    @RequestMeta() request: RequestMetadata,
  ) {
    return this.projectsService.addMember(user.sub, projectId, dto, request);
  }

  @Patch(':memberId')
  @ApiOperation({ summary: 'Update a project member role' })
  updateRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateProjectMemberRoleDto,
    @RequestMeta() request: RequestMetadata,
  ) {
    return this.projectsService.updateMemberRole(
      user.sub,
      projectId,
      memberId,
      dto,
      request,
    );
  }

  @Delete(':memberId')
  @ApiOperation({ summary: 'Remove a project member' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('memberId') memberId: string,
    @RequestMeta() request: RequestMetadata,
  ) {
    return this.projectsService.removeMember(user.sub, projectId, memberId, request);
  }
}
