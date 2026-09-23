import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestMeta } from '../common/decorators/request-metadata.decorator';
import { Cacheable } from '../common/interceptors/etag.interceptor';
import { Idempotent } from '../common/decorators/idempotent.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import type { RequestMetadata } from '../common/interfaces/request-metadata.interface';
import { CreateRuleDto } from './dto/create-rule.dto';
import { ListRulesQueryDto } from './dto/list-rules.dto';
import { SimulateRuleDto } from './dto/simulate-rule.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';
import { RulesService } from './rules.service';
import { UuidParam } from '../common/pipes/uuid-param.pipe';

@ApiTags('rules')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'projects/:projectId/rules', version: '1' })
export class RulesController {
  constructor(private readonly rulesService: RulesService) {}

  @Post()
  @Idempotent()
  @ApiOperation({ summary: 'Create a rate-limit rule for a project' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', UuidParam) projectId: string,
    @Body() dto: CreateRuleDto,
    @RequestMeta() request: RequestMetadata,
  ) {
    return this.rulesService.create(user.sub, projectId, dto, request);
  }

  @Get()
  @Cacheable({ maxAge: 30, scope: 'private' })
  @ApiOperation({
    summary:
      'List rate-limit rules for a project with cursor pagination, filtering by scope / algorithm / isActive, and sort by priority or recency',
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', UuidParam) projectId: string,
    @Query() query: ListRulesQueryDto,
  ) {
    return this.rulesService.listByProject(user.sub, projectId, query);
  }

  @Post('simulate')
  @Idempotent()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Simulate a rule against isolated counters before enabling it. Read-only computation; 200, not 201',
  })
  simulate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', UuidParam) projectId: string,
    @Body() dto: SimulateRuleDto,
    @RequestMeta() request: RequestMetadata,
  ) {
    return this.rulesService.simulate(user.sub, projectId, dto, request);
  }

  @Patch(':ruleId')
  @Idempotent()
  @ApiOperation({ summary: 'Update a rate-limit rule' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', UuidParam) projectId: string,
    @Param('ruleId', UuidParam) ruleId: string,
    @Body() dto: UpdateRuleDto,
    @RequestMeta() request: RequestMetadata,
  ) {
    return this.rulesService.update(user.sub, projectId, ruleId, dto, request);
  }

  @Delete(':ruleId')
  @ApiOperation({ summary: 'Delete a rate-limit rule' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', UuidParam) projectId: string,
    @Param('ruleId', UuidParam) ruleId: string,
    @RequestMeta() request: RequestMetadata,
  ) {
    return this.rulesService.delete(user.sub, projectId, ruleId, request);
  }
}
