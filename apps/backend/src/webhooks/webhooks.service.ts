import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ProjectRole, RequestDecision, WebhookEventType } from '@prisma/client';
import { createHmac } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { RequestMetadata } from '../common/interfaces/request-metadata.interface';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { RedisService } from '../redis/redis.service';
import { CreateWebhookEndpointDto } from './dto/create-webhook-endpoint.dto';
import { UpdateWebhookEndpointDto } from './dto/update-webhook-endpoint.dto';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly redisService: RedisService,
    private readonly auditService: AuditService,
  ) {}

  async list(userId: string, projectId: string) {
    await this.projectsService.assertProjectAccess(userId, projectId, [
      ProjectRole.OWNER,
      ProjectRole.ADMIN,
    ]);

    return this.prismaService.webhookEndpoint.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(
    userId: string,
    projectId: string,
    dto: CreateWebhookEndpointDto,
    request?: RequestMetadata,
  ) {
    await this.projectsService.assertProjectAccess(userId, projectId, [
      ProjectRole.OWNER,
      ProjectRole.ADMIN,
    ]);

    const endpoint = await this.prismaService.webhookEndpoint.create({
      data: {
        projectId,
        name: dto.name,
        url: dto.url,
        signingSecret: dto.signingSecret,
        eventType: dto.eventType ?? WebhookEventType.HIGH_BLOCKED_ACTIVITY,
        blockedRequestsThreshold: dto.blockedRequestsThreshold ?? 25,
        windowSeconds: dto.windowSeconds ?? 300,
        cooldownSeconds: dto.cooldownSeconds ?? 300,
        isActive: dto.isActive ?? true,
      },
    });

    void this.auditService.log({
      action: 'webhook.created',
      actorId: userId,
      projectId,
      resourceType: 'webhook_endpoint',
      resourceId: endpoint.id,
      metadata: {
        url: endpoint.url,
        eventType: endpoint.eventType,
      },
      request,
    });

    return endpoint;
  }

  async update(
    userId: string,
    projectId: string,
    webhookId: string,
    dto: UpdateWebhookEndpointDto,
    request?: RequestMetadata,
  ) {
    await this.projectsService.assertProjectAccess(userId, projectId, [
      ProjectRole.OWNER,
      ProjectRole.ADMIN,
    ]);

    const endpoint = await this.prismaService.webhookEndpoint.findFirst({
      where: { id: webhookId, projectId },
    });

    if (!endpoint) {
      throw new NotFoundException('Webhook endpoint not found');
    }

    const updated = await this.prismaService.webhookEndpoint.update({
      where: { id: webhookId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.url !== undefined && { url: dto.url }),
        ...(dto.blockedRequestsThreshold !== undefined && {
          blockedRequestsThreshold: dto.blockedRequestsThreshold,
        }),
        ...(dto.windowSeconds !== undefined && { windowSeconds: dto.windowSeconds }),
        ...(dto.cooldownSeconds !== undefined && { cooldownSeconds: dto.cooldownSeconds }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    void this.auditService.log({
      action: 'webhook.updated',
      actorId: userId,
      projectId,
      resourceType: 'webhook_endpoint',
      resourceId: webhookId,
      metadata: { changes: { ...dto } } as any,
      request,
    });

    return updated;
  }

  async remove(
    userId: string,
    projectId: string,
    webhookId: string,
    request?: RequestMetadata,
  ) {
    await this.projectsService.assertProjectAccess(userId, projectId, [
      ProjectRole.OWNER,
      ProjectRole.ADMIN,
    ]);

    const endpoint = await this.prismaService.webhookEndpoint.findFirst({
      where: { id: webhookId, projectId },
    });

    if (!endpoint) {
      throw new NotFoundException('Webhook endpoint not found');
    }

    await this.prismaService.webhookEndpoint.delete({
      where: { id: webhookId },
    });

    void this.auditService.log({
      action: 'webhook.deleted',
      actorId: userId,
      projectId,
      resourceType: 'webhook_endpoint',
      resourceId: webhookId,
      metadata: {
        url: endpoint.url,
      },
      request,
    });

    return { success: true };
  }

  async notifyHighBlockedActivity(params: {
    projectId: string;
    endpoint: string;
    method: string;
    ruleId?: string;
    ruleName?: string;
    ipAddress: string;
  }) {
    const endpoints = await this.prismaService.webhookEndpoint.findMany({
      where: {
        projectId: params.projectId,
        eventType: WebhookEventType.HIGH_BLOCKED_ACTIVITY,
        isActive: true,
      },
    });

    for (const endpoint of endpoints) {
      const since = new Date(Date.now() - endpoint.windowSeconds * 1000);
      const blockedRequests = await this.prismaService.requestLog.count({
        where: {
          projectId: params.projectId,
          decision: RequestDecision.BLOCKED,
          createdAt: {
            gte: since,
          },
        },
      });

      if (blockedRequests < endpoint.blockedRequestsThreshold) {
        continue;
      }

      const cooldownKey = [
        'rlaas',
        'webhook',
        'cooldown',
        endpoint.id,
        params.projectId,
      ].join(':');

      const claimed = await this.redisService
        .getClient()
        .set(cooldownKey, '1', 'EX', endpoint.cooldownSeconds, 'NX');

      if (claimed !== 'OK') {
        continue;
      }

      const payload = {
        event: endpoint.eventType,
        projectId: params.projectId,
        blockedRequests,
        threshold: endpoint.blockedRequestsThreshold,
        windowSeconds: endpoint.windowSeconds,
        triggeredAt: new Date().toISOString(),
        sample: {
          endpoint: params.endpoint,
          method: params.method,
          ruleId: params.ruleId,
          ruleName: params.ruleName,
          ipAddress: params.ipAddress,
        },
      };

      const body = JSON.stringify(payload);

      try {
        await fetch(endpoint.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-rlaas-event': endpoint.eventType,
            ...(endpoint.signingSecret
              ? {
                  'x-rlaas-signature': createHmac('sha256', endpoint.signingSecret)
                    .update(body)
                    .digest('hex'),
                }
              : {}),
          },
          body,
          signal: AbortSignal.timeout(5000),
        });

        await this.prismaService.webhookEndpoint.update({
          where: { id: endpoint.id },
          data: { lastTriggeredAt: new Date() },
        });
      } catch (error) {
        this.logger.error(
          `Failed to deliver webhook ${endpoint.id} for project ${params.projectId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }
}
