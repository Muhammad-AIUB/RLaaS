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
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

@ApiTags('projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'projects', version: '1' })
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a project' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProjectDto,
    @RequestMeta() request: RequestMetadata,
  ) {
    return this.projectsService.create(user.sub, dto, request);
  }

  @Get()
  @ApiOperation({ summary: 'List projects for the authenticated user' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.projectsService.listByUser(user.sub);
  }

  @Get(':projectId')
  @ApiOperation({ summary: 'Get project details' })
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ) {
    return this.projectsService.getById(user.sub, projectId);
  }

  @Patch(':projectId')
  @ApiOperation({ summary: 'Update a project' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: UpdateProjectDto,
    @RequestMeta() request: RequestMetadata,
  ) {
    return this.projectsService.update(user.sub, projectId, dto, request);
  }

  @Delete(':projectId')
  @ApiOperation({ summary: 'Delete a project' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @RequestMeta() request: RequestMetadata,
  ) {
    return this.projectsService.delete(user.sub, projectId, request);
  }
}
