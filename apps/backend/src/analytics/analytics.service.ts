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
import { RedisService } from '../redis/redis.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import { CreateSnapshotDto } from './dto/create-snapshot.dto';

const ANALYTICS_TTL = 60;

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly redisService: RedisService,
  ) {}

  private analyticsKey(type: string, projectId: string, query: AnalyticsQueryDto) {
    const q = `${query.from?.toISOString() ?? ''}:${query.to?.toISOString() ?? ''}:${query.limit ?? ''}`;
    return `cache:analytics:${type}:${projectId}:${q}`;
  }

  async getOverview(userId: string, projectId: string, query: AnalyticsQueryDto) {
    const key = this.analyticsKey('overview', projectId, query);
    try {
      const cached = await this.redisService.getClient().get(key);
      if (cached) return JSON.parse(cached);
    } catch { /* fall through */ }

    await this.projectsService.assertProjectAccess(userId, projectId, [
      ProjectRole.OWNER,
      ProjectRole.ADMIN,
      ProjectRole.VIEWER,
    ]);
    const result = await this.queryOverview(projectId, query);
    try {
      await this.redisService.getClient().setex(key, ANALYTICS_TTL, JSON.stringify(result));
    } catch { /* non-critical */ }
    return result;
  }

  async getTopIps(userId: string, projectId: string, query: AnalyticsQueryDto) {
    const key = this.analyticsKey('topIps', projectId, query);
    try {
      const cached = await this.redisService.getClient().get(key);
      if (cached) return JSON.parse(cached);
    } catch { /* fall through */ }

    await this.projectsService.assertProjectAccess(userId, projectId, [
      ProjectRole.OWNER,
      ProjectRole.ADMIN,
      ProjectRole.VIEWER,
    ]);
    const result = await this.queryTopIps(projectId, query);
    try {
      await this.redisService.getClient().setex(key, ANALYTICS_TTL, JSON.stringify(result));
    } catch { /* non-critical */ }
    return result;
  }

  async getTopEndpoints(userId: string, projectId: string, query: AnalyticsQueryDto) {
    const key = this.analyticsKey('topEndpoints', projectId, query);
    try {
      const cached = await this.redisService.getClient().get(key);
      if (cached) return JSON.parse(cached);
    } catch { /* fall through */ }

    await this.projectsService.assertProjectAccess(userId, projectId, [
      ProjectRole.OWNER,
      ProjectRole.ADMIN,
      ProjectRole.VIEWER,
    ]);
    const result = await this.queryTopEndpoints(projectId, query);
    try {
      await this.redisService.getClient().setex(key, ANALYTICS_TTL, JSON.stringify(result));
    } catch { /* non-critical */ }
    return result;
  }

  async getAlgorithmPerformance(
    userId: string,
    projectId: string,
    query: AnalyticsQueryDto,
  ) {
    const key = this.analyticsKey('algorithms', projectId, query);
    try {
      const cached = await this.redisService.getClient().get(key);
      if (cached) return JSON.parse(cached);
    } catch { /* fall through */ }

    await this.projectsService.assertProjectAccess(userId, projectId, [
      ProjectRole.OWNER,
      ProjectRole.ADMIN,
      ProjectRole.VIEWER,
    ]);
    const result = await this.queryAlgorithmPerformance(projectId, query);
    try {
      await this.redisService.getClient().setex(key, ANALYTICS_TTL, JSON.stringify(result));
    } catch { /* non-critical */ }
    return result;
  }

  private async queryOverview(projectId: string, query: AnalyticsQueryDto) {
    const where = this.buildWhere(projectId, query);
    const grouped = await this.prismaService.requestLog.groupBy({
      by: ['decision'],
      where,
      _count: { _all: true },
    });

    const allowedRequests =
      grouped.find((g) => g.decision === RequestDecision.ALLOWED)?._count._all ?? 0;
    const blockedRequests =
      grouped.find((g) => g.decision === RequestDecision.BLOCKED)?._count._all ?? 0;
    const totalRequests = allowedRequests + blockedRequests;
    const blockRate = totalRequests === 0 ? 0 : (blockedRequests / totalRequests) * 100;

    return {
      totalRequests,
      allowedRequests,
      blockedRequests,
      blockRate: Number(blockRate.toFixed(2)),
    };
  }

  private async queryTopIps(projectId: string, query: AnalyticsQueryDto) {
    const limit = query.limit ?? 5;
    const grouped = await this.prismaService.requestLog.groupBy({
      by: ['ipAddress'],
      where: this.buildWhere(projectId, query),
      _count: { _all: true },
      orderBy: { _count: { ipAddress: 'desc' } },
      take: limit,
    });
    return grouped.map((item) => ({ ip: item.ipAddress, requests: item._count._all }));
  }

  private async queryTopEndpoints(projectId: string, query: AnalyticsQueryDto) {
    const limit = query.limit ?? 5;
    const grouped = await this.prismaService.requestLog.groupBy({
      by: ['endpoint', 'method'],
      where: this.buildWhere(projectId, query),
      _count: { _all: true },
      orderBy: { _count: { endpoint: 'desc' } },
      take: limit,
    });
    return grouped.map((item) => ({
      endpoint: item.endpoint,
      method: item.method,
      requests: item._count._all,
    }));
  }

  private async queryAlgorithmPerformance(projectId: string, query: AnalyticsQueryDto) {
    const grouped = await this.prismaService.requestLog.groupBy({
      by: ['algorithm'],
      where: this.buildWhere(projectId, query),
      _count: { _all: true },
      _avg: { retryAfter: true, responseTimeMs: true },
    });
    return grouped.map((item) => ({
      algorithm: item.algorithm,
      requests: item._count._all,
      averageRetryAfter: Number((item._avg.retryAfter ?? 0).toFixed(2)),
      averageResponseTimeMs: Number((item._avg.responseTimeMs ?? 0).toFixed(2)),
    }));
  }

  async getRecentLogs(userId: string, projectId: string, query: AnalyticsQueryDto) {
    await this.projectsService.assertProjectAccess(userId, projectId, [
      ProjectRole.OWNER,
      ProjectRole.ADMIN,
      ProjectRole.VIEWER,
    ]);
    const limit = query.limit ?? 20;

    const startedAt = performance.now();
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

    const [apiKeys, rules] = await Promise.all([
      apiKeyIds.length > 0
        ? this.prismaService.apiKey.findMany({
            where: { id: { in: apiKeyIds } },
            select: { id: true, name: true, keyPrefix: true, status: true },
          })
        : [],
      ruleIds.length > 0
        ? this.prismaService.rateLimitRule.findMany({
            where: { id: { in: ruleIds } },
            select: { id: true, name: true, scope: true, priority: true },
          })
        : [],
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
    this.logger.debug(
      `analytics.logs projectId=${projectId} limit=${limit} totalMs=${(performance.now() - startedAt).toFixed(0)}`,
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
      this.queryOverview(projectId, query),
      this.queryTopIps(projectId, query),
      this.queryTopEndpoints(projectId, query),
      this.queryAlgorithmPerformance(projectId, query),
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
