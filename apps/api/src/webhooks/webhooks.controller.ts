import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestMeta } from '../common/decorators/request-metadata.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import type { RequestMetadata } from '../common/interfaces/request-metadata.interface';
import { CreateWebhookEndpointDto } from './dto/create-webhook-endpoint.dto';
import { WebhooksService } from './webhooks.service';

@ApiTags('webhooks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'projects/:projectId/webhooks', version: '1' })
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Get()
  @ApiOperation({ summary: 'List webhook alert endpoints for a project' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ) {
    return this.webhooksService.list(user.sub, projectId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a webhook endpoint for blocked activity alerts' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateWebhookEndpointDto,
    @RequestMeta() request: RequestMetadata,
  ) {
    return this.webhooksService.create(user.sub, projectId, dto, request);
  }

  @Delete(':webhookId')
  @ApiOperation({ summary: 'Delete a webhook endpoint' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('webhookId') webhookId: string,
    @RequestMeta() request: RequestMetadata,
  ) {
    return this.webhooksService.remove(user.sub, projectId, webhookId, request);
  }
}
