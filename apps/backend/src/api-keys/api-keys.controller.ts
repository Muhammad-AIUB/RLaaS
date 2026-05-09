import {
  Body,
  Controller,
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
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@ApiTags('api-keys')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'projects/:projectId/api-keys', version: '1' })
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  @ApiOperation({ summary: 'Generate a new API key for a project' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateApiKeyDto,
    @RequestMeta() request: RequestMetadata,
  ) {
    return this.apiKeysService.create(user.sub, projectId, dto, request);
  }

  @Get()
  @ApiOperation({ summary: 'List API keys for a project' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ) {
    return this.apiKeysService.listByProject(user.sub, projectId);
  }

  @Patch(':apiKeyId/revoke')
  @ApiOperation({ summary: 'Revoke an API key for a project' })
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('apiKeyId') apiKeyId: string,
    @RequestMeta() request: RequestMetadata,
  ) {
    return this.apiKeysService.revoke(user.sub, projectId, apiKeyId, request);
  }
}
