import {
  AnalyticsSnapshot,
  Prisma,
  RequestDecision,
  SnapshotWindow,
} from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import { CreateSnapshotDto } from './dto/create-snapshot.dto';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  async getOverview(ownerId: string, projectId: string, query: AnalyticsQueryDto) {
    await this.projectsService.getById(ownerId, projectId);
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

  async getTopIps(ownerId: string, projectId: string, query: AnalyticsQueryDto) {
    await this.projectsService.getById(ownerId, projectId);
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

  async getTopEndpoints(ownerId: string, projectId: string, query: AnalyticsQueryDto) {
    await this.projectsService.getById(ownerId, projectId);
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
    ownerId: string,
    projectId: string,
    query: AnalyticsQueryDto,
  ) {
    await this.projectsService.getById(ownerId, projectId);

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

  async getRecentLogs(ownerId: string, projectId: string, query: AnalyticsQueryDto) {
    await this.projectsService.getById(ownerId, projectId);
    const limit = query.limit ?? 20;

    return this.prismaService.requestLog.findMany({
      where: this.buildWhere(projectId, query),
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      include: {
        apiKey: {
          select: {
            id: true,
            name: true,
            keyPrefix: true,
            status: true,
          },
        },
        rule: {
          select: {
            id: true,
            name: true,
            scope: true,
            priority: true,
          },
        },
      },
    });
  }

  async createSnapshot(
    ownerId: string,
    projectId: string,
    dto: CreateSnapshotDto,
  ): Promise<AnalyticsSnapshot> {
    await this.projectsService.getById(ownerId, projectId);

    const periodStart = dto.from ?? this.defaultFrom(dto.window);
    const periodEnd = dto.to ?? new Date();
    const query: AnalyticsQueryDto = {
      from: periodStart,
      to: periodEnd,
      limit: 10,
    };

    const [overview, topIps, topEndpoints, algorithmPerformance] = await Promise.all([
      this.getOverview(ownerId, projectId, query),
      this.getTopIps(ownerId, projectId, query),
      this.getTopEndpoints(ownerId, projectId, query),
      this.getAlgorithmPerformance(ownerId, projectId, query),
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

  async listSnapshots(ownerId: string, projectId: string, query: AnalyticsQueryDto) {
    await this.projectsService.getById(ownerId, projectId);
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
