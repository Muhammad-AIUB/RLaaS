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
import { CreateRuleDto } from './dto/create-rule.dto';
import { SimulateRuleDto } from './dto/simulate-rule.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';
import { RulesService } from './rules.service';

@ApiTags('rules')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'projects/:projectId/rules', version: '1' })
export class RulesController {
  constructor(private readonly rulesService: RulesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a rate-limit rule for a project' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateRuleDto,
    @RequestMeta() request: RequestMetadata,
  ) {
    return this.rulesService.create(user.sub, projectId, dto, request);
  }

  @Get()
  @ApiOperation({ summary: 'List rules for a project' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ) {
    return this.rulesService.listByProject(user.sub, projectId);
  }

  @Post('simulate')
  @ApiOperation({ summary: 'Simulate a rule against isolated counters before enabling it' })
  simulate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: SimulateRuleDto,
    @RequestMeta() request: RequestMetadata,
  ) {
    return this.rulesService.simulate(user.sub, projectId, dto, request);
  }

  @Patch(':ruleId')
  @ApiOperation({ summary: 'Update a rate-limit rule' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('ruleId') ruleId: string,
    @Body() dto: UpdateRuleDto,
    @RequestMeta() request: RequestMetadata,
  ) {
    return this.rulesService.update(user.sub, projectId, ruleId, dto, request);
  }

  @Delete(':ruleId')
  @ApiOperation({ summary: 'Delete a rate-limit rule' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('ruleId') ruleId: string,
    @RequestMeta() request: RequestMetadata,
  ) {
    return this.rulesService.delete(user.sub, projectId, ruleId, request);
  }
}
