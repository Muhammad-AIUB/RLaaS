import {
  AnalyticsSnapshot,
  ApiKeyStatus,
  Prisma,
  ProjectRole,
  RequestDecision,
  RuleScope,
  SnapshotWindow,
} from '@prisma/client';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import { CreateSnapshotDto } from './dto/create-snapshot.dto';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  async getOverview(userId: string, projectId: string, query: AnalyticsQueryDto) {
    await this.projectsService.assertProjectAccess(userId, projectId, [
      ProjectRole.OWNER,
      ProjectRole.ADMIN,
      ProjectRole.VIEWER,
    ]);
    const where = this.buildWhere(projectId, query);

    const [totalRequests, allowedRequests, blockedRequests] = await Promise.all([
      this.prismaService.requestLog.count({ where }),
      this.prismaService.requestLog.count({
        where: {
          ...where,
          decision: RequestDecision.ALLOWED,
        },
      }),
      this.prismaService.requestLog.count({
        where: {
          ...where,
          decision: RequestDecision.BLOCKED,
        },
      }),
    ]);

    const blockRate = totalRequests === 0 ? 0 : (blockedRequests / totalRequests) * 100;

    return {
      totalRequests,
      allowedRequests,
      blockedRequests,
      blockRate: Number(blockRate.toFixed(2)),
    };
  }

  async getTopIps(userId: string, projectId: string, query: AnalyticsQueryDto) {
    await this.projectsService.assertProjectAccess(userId, projectId, [
      ProjectRole.OWNER,
      ProjectRole.ADMIN,
      ProjectRole.VIEWER,
    ]);
    const limit = query.limit ?? 5;

    const grouped = await this.prismaService.requestLog.groupBy({
      by: ['ipAddress'],
      where: this.buildWhere(projectId, query),
      _count: {
        _all: true,
      },
      orderBy: {
        _count: {
          ipAddress: 'desc',
        },
      },
      take: limit,
    });

    return grouped.map((item) => ({
      ip: item.ipAddress,
      requests: item._count._all,
    }));
  }

  async getTopEndpoints(userId: string, projectId: string, query: AnalyticsQueryDto) {
    await this.projectsService.assertProjectAccess(userId, projectId, [
      ProjectRole.OWNER,
      ProjectRole.ADMIN,
      ProjectRole.VIEWER,
    ]);
    const limit = query.limit ?? 5;

    const grouped = await this.prismaService.requestLog.groupBy({
      by: ['endpoint', 'method'],
      where: this.buildWhere(projectId, query),
      _count: {
        _all: true,
      },
      orderBy: {
        _count: {
          endpoint: 'desc',
        },
      },
      take: limit,
    });

    return grouped.map((item) => ({
      endpoint: item.endpoint,
      method: item.method,
      requests: item._count._all,
    }));
  }

  async getAlgorithmPerformance(
    userId: string,
    projectId: string,
    query: AnalyticsQueryDto,
  ) {
    await this.projectsService.assertProjectAccess(userId, projectId, [
      ProjectRole.OWNER,
      ProjectRole.ADMIN,
      ProjectRole.VIEWER,
    ]);

    const grouped = await this.prismaService.requestLog.groupBy({
      by: ['algorithm'],
      where: this.buildWhere(projectId, query),
      _count: {
        _all: true,
      },
      _avg: {
        retryAfter: true,
        responseTimeMs: true,
      },
    });

    return grouped.map((item) => ({
      algorithm: item.algorithm,
      requests: item._count._all,
      averageRetryAfter: Number((item._avg.retryAfter ?? 0).toFixed(2)),
      averageResponseTimeMs: Number((item._avg.responseTimeMs ?? 0).toFixed(2)),
    }));
  }

  async getRecentLogs(userId: string, projectId: string, query: AnalyticsQueryDto) {
    const startedAt = performance.now();
    const accessStartedAt = performance.now();
    await this.projectsService.assertProjectAccess(userId, projectId, [
      ProjectRole.OWNER,
      ProjectRole.ADMIN,
      ProjectRole.VIEWER,
    ]);
    const accessDurationMs = performance.now() - accessStartedAt;
    const limit = query.limit ?? 20;
    const queryStartedAt = performance.now();
    const logFetchStartedAt = performance.now();

    const logs = await this.prismaService.requestLog.findMany({
      where: this.buildWhere(projectId, query),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: {
        id: true,
        projectId: true,
        apiKeyId: true,
        ruleId: true,
        requestId: true,
        idempotencyKey: true,
        ipAddress: true,
        endpoint: true,
        method: true,
        userTier: true,
        decision: true,
        reason: true,
        algorithm: true,
        limit: true,
        remaining: true,
        retryAfter: true,
        responseTimeMs: true,
        metadata: true,
        createdAt: true,
      },
    });
    const logFetchDurationMs = performance.now() - logFetchStartedAt;

    const apiKeyIds = Array.from(
      new Set(
        logs
          .map((log) => log.apiKeyId)
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const ruleIds = Array.from(
      new Set(
        logs
          .map((log) => log.ruleId)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    let apiKeyHydrationDurationMs = 0;
    let ruleHydrationDurationMs = 0;
    const [apiKeys, rules] = await Promise.all([
      (async () => {
        const apiKeyHydrationStartedAt = performance.now();
        const result =
          apiKeyIds.length > 0
            ? await this.prismaService.apiKey.findMany({
                where: {
                  id: {
                    in: apiKeyIds,
                  },
                },
                select: {
                  id: true,
                  name: true,
                  keyPrefix: true,
                  status: true,
                },
              })
            : [];
        apiKeyHydrationDurationMs =
          performance.now() - apiKeyHydrationStartedAt;
        return result;
      })(),
      (async () => {
        const ruleHydrationStartedAt = performance.now();
        const result =
          ruleIds.length > 0
            ? await this.prismaService.rateLimitRule.findMany({
                where: {
                  id: {
                    in: ruleIds,
                  },
                },
                select: {
                  id: true,
                  name: true,
                  scope: true,
                  priority: true,
                },
              })
            : [];
        ruleHydrationDurationMs = performance.now() - ruleHydrationStartedAt;
        return result;
      })(),
    ]);

    const apiKeyById = new Map<
      string,
      { id: string; name: string; keyPrefix: string; status: ApiKeyStatus }
    >();
    for (const apiKey of apiKeys) {
      apiKeyById.set(apiKey.id, {
        id: apiKey.id,
        name: apiKey.name,
        keyPrefix: apiKey.keyPrefix,
        status: apiKey.status as ApiKeyStatus,
      });
    }

    const ruleById = new Map<
      string,
      { id: string; name: string; scope: RuleScope; priority: number }
    >();
    for (const rule of rules) {
      ruleById.set(rule.id, {
        id: rule.id,
        name: rule.name,
        scope: rule.scope as RuleScope,
        priority: rule.priority,
      });
    }
    const queryDurationMs = performance.now() - queryStartedAt;
    const totalDurationMs = performance.now() - startedAt;

    this.logger.log(
      [
        'analytics.logs',
        `projectId=${projectId}`,
        `limit=${limit}`,
        `accessMs=${accessDurationMs.toFixed(2)}`,
        `logFetchMs=${logFetchDurationMs.toFixed(2)}`,
        `apiKeyHydrationMs=${apiKeyHydrationDurationMs.toFixed(2)}`,
        `ruleHydrationMs=${ruleHydrationDurationMs.toFixed(2)}`,
        `queryMs=${queryDurationMs.toFixed(2)}`,
        `totalMs=${totalDurationMs.toFixed(2)}`,
      ].join(' '),
    );

    return logs.map((log) => {
      const apiKey = log.apiKeyId ? apiKeyById.get(log.apiKeyId) ?? null : null;
      const rule = log.ruleId ? ruleById.get(log.ruleId) ?? null : null;

      return {
        ...log,
        apiKey: apiKey
          ? {
              ...apiKey,
              status: apiKey.status,
            }
          : null,
        rule: rule
          ? {
              ...rule,
              scope: rule.scope,
            }
          : null,
      };
    });
  }

  async createSnapshot(
    userId: string,
    projectId: string,
    dto: CreateSnapshotDto,
  ): Promise<AnalyticsSnapshot> {
    await this.projectsService.assertProjectAccess(userId, projectId, [
      ProjectRole.OWNER,
      ProjectRole.ADMIN,
    ]);

    const periodStart = dto.from ?? this.defaultFrom(dto.window);
    const periodEnd = dto.to ?? new Date();
    const query: AnalyticsQueryDto = {
      from: periodStart,
      to: periodEnd,
      limit: 10,
    };

    const [overview, topIps, topEndpoints, algorithmPerformance] = await Promise.all([
      this.getOverview(userId, projectId, query),
      this.getTopIps(userId, projectId, query),
      this.getTopEndpoints(userId, projectId, query),
      this.getAlgorithmPerformance(userId, projectId, query),
    ]);

    return this.prismaService.analyticsSnapshot.upsert({
      where: {
        projectId_window_periodStart_periodEnd: {
          projectId,
          window: dto.window,
          periodStart,
          periodEnd,
        },
      },
      update: {
        totalRequests: overview.totalRequests,
        allowedRequests: overview.allowedRequests,
        blockedRequests: overview.blockedRequests,
        blockRate: new Prisma.Decimal(overview.blockRate),
        topOffendingIps: topIps,
        mostUsedEndpoints: topEndpoints,
        algorithmPerformanceComparison: algorithmPerformance,
      },
      create: {
        projectId,
        window: dto.window,
        periodStart,
        periodEnd,
        totalRequests: overview.totalRequests,
        allowedRequests: overview.allowedRequests,
        blockedRequests: overview.blockedRequests,
        blockRate: new Prisma.Decimal(overview.blockRate),
        topOffendingIps: topIps,
        mostUsedEndpoints: topEndpoints,
        algorithmPerformanceComparison: algorithmPerformance,
      },
    });
  }

  async listSnapshots(userId: string, projectId: string, query: AnalyticsQueryDto) {
    await this.projectsService.assertProjectAccess(userId, projectId, [
      ProjectRole.OWNER,
      ProjectRole.ADMIN,
      ProjectRole.VIEWER,
    ]);
    const limit = query.limit ?? 20;

    return this.prismaService.analyticsSnapshot.findMany({
      where: {
        projectId,
        ...(query.from || query.to
          ? {
              periodStart: {
                ...(query.from ? { gte: query.from } : {}),
              },
              periodEnd: {
                ...(query.to ? { lte: query.to } : {}),
              },
            }
          : {}),
      },
      orderBy: {
        periodStart: 'desc',
      },
      take: limit,
    });
  }

  private buildWhere(projectId: string, query: AnalyticsQueryDto): Prisma.RequestLogWhereInput {
    return {
      projectId,
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
    };
  }

  private defaultFrom(window: SnapshotWindow): Date {
    const now = new Date();

    switch (window) {
      case SnapshotWindow.HOURLY:
        return new Date(now.getTime() - 60 * 60 * 1000);
      case SnapshotWindow.DAILY:
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case SnapshotWindow.WEEKLY:
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case SnapshotWindow.MONTHLY:
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
  }
}
