import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  const countMock = jest.fn();
  const groupByMock = jest.fn();
  const requestLogFindManyMock = jest.fn();
  const snapshotFindManyMock = jest.fn();
  const apiKeyFindManyMock = jest.fn();
  const rateLimitRuleFindManyMock = jest.fn();
  const upsertMock = jest.fn();
  const assertProjectAccessMock = jest.fn();

  const prismaService = {
    requestLog: {
      count: countMock,
      groupBy: groupByMock,
      findMany: requestLogFindManyMock,
    },
    analyticsSnapshot: {
      upsert: upsertMock,
      findMany: snapshotFindManyMock,
    },
    apiKey: {
      findMany: apiKeyFindManyMock,
    },
    rateLimitRule: {
      findMany: rateLimitRuleFindManyMock,
    },
  } as unknown as PrismaService;

  const projectsService = {
    assertProjectAccess: assertProjectAccessMock,
  } as unknown as ProjectsService;

  const service = new AnalyticsService(prismaService, projectsService);

  beforeEach(() => {
    countMock.mockReset();
    groupByMock.mockReset();
    requestLogFindManyMock.mockReset();
    snapshotFindManyMock.mockReset();
    apiKeyFindManyMock.mockReset();
    rateLimitRuleFindManyMock.mockReset();
    upsertMock.mockReset();
    assertProjectAccessMock.mockReset();
    assertProjectAccessMock.mockResolvedValue({});
  });

  it('computes overview totals and block rate', async () => {
    groupByMock.mockResolvedValueOnce([
      { decision: 'ALLOWED', _count: { _all: 150 } },
      { decision: 'BLOCKED', _count: { _all: 50 } },
    ]);

    await expect(
      service.getOverview('user-1', 'project-1', {}),
    ).resolves.toEqual({
      totalRequests: 200,
      allowedRequests: 150,
      blockedRequests: 50,
      blockRate: 25,
    });
  });

  it('builds a snapshot from aggregated analytics inputs', async () => {
    groupByMock
      .mockResolvedValueOnce([
        { decision: 'ALLOWED', _count: { _all: 80 } },
        { decision: 'BLOCKED', _count: { _all: 20 } },
      ])
      .mockResolvedValueOnce([
        { ipAddress: '203.0.113.10', _count: { _all: 12 } },
      ])
      .mockResolvedValueOnce([
        { endpoint: '/api/products', method: 'GET', _count: { _all: 40 } },
      ])
      .mockResolvedValueOnce([
        {
          algorithm: 'FIXED_WINDOW',
          _count: { _all: 100 },
          _avg: { retryAfter: 1.5, responseTimeMs: 12.4 },
        },
      ]);
    upsertMock.mockResolvedValue({
      id: 'snapshot-1',
      projectId: 'project-1',
      blockRate: new Prisma.Decimal(20),
    });

    const from = new Date('2026-05-01T00:00:00.000Z');
    const to = new Date('2026-05-07T00:00:00.000Z');

    await service.createSnapshot('user-1', 'project-1', {
      window: 'DAILY',
      from,
      to,
    });

    expect(upsertMock).toHaveBeenCalledWith({
      where: {
        projectId_window_periodStart_periodEnd: {
          projectId: 'project-1',
          window: 'DAILY',
          periodStart: from,
          periodEnd: to,
        },
      },
      update: expect.objectContaining({
        totalRequests: 100,
        allowedRequests: 80,
        blockedRequests: 20,
        blockRate: expect.any(Prisma.Decimal),
      }),
      create: expect.objectContaining({
        projectId: 'project-1',
        window: 'DAILY',
        periodStart: from,
        periodEnd: to,
      }),
    });
  });

  it('fetches recent logs with a top-level select and hydrates the response shape', async () => {
    const createdAt = new Date('2026-05-08T12:00:00.000Z');

    requestLogFindManyMock.mockResolvedValue([
      {
        id: 'log-1',
        projectId: 'project-1',
        apiKeyId: 'api-key-1',
        ruleId: 'rule-1',
        requestId: 'request-1',
        idempotencyKey: 'idem-1',
        ipAddress: '203.0.113.10',
        endpoint: '/v1/messages',
        method: 'POST',
        userTier: 'PRO',
        decision: 'ALLOWED',
        reason: null,
        algorithm: 'TOKEN_BUCKET',
        limit: 100,
        remaining: 99,
        retryAfter: 0,
        responseTimeMs: 12,
        metadata: { region: 'iad' },
        createdAt,
      },
    ]);
    apiKeyFindManyMock.mockResolvedValue([
      {
        id: 'api-key-1',
        name: 'Production',
        keyPrefix: 'rlaas_live',
        status: 'ACTIVE',
      },
    ]);
    rateLimitRuleFindManyMock.mockResolvedValue([
      {
        id: 'rule-1',
        name: 'Default',
        scope: 'GLOBAL',
        priority: 10,
      },
    ]);

    await expect(
      service.getRecentLogs('user-1', 'project-1', { limit: 8 }),
    ).resolves.toEqual([
      {
        id: 'log-1',
        projectId: 'project-1',
        apiKeyId: 'api-key-1',
        ruleId: 'rule-1',
        requestId: 'request-1',
        idempotencyKey: 'idem-1',
        ipAddress: '203.0.113.10',
        endpoint: '/v1/messages',
        method: 'POST',
        userTier: 'PRO',
        decision: 'ALLOWED',
        reason: null,
        algorithm: 'TOKEN_BUCKET',
        limit: 100,
        remaining: 99,
        retryAfter: 0,
        responseTimeMs: 12,
        metadata: { region: 'iad' },
        createdAt,
        apiKey: {
          id: 'api-key-1',
          name: 'Production',
          keyPrefix: 'rlaas_live',
          status: 'ACTIVE',
        },
        rule: {
          id: 'rule-1',
          name: 'Default',
          scope: 'GLOBAL',
          priority: 10,
        },
      },
    ]);

    expect(requestLogFindManyMock).toHaveBeenCalledWith({
      where: {
        projectId: 'project-1',
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 8,
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
    expect(apiKeyFindManyMock).toHaveBeenCalledWith({
      where: {
        id: {
          in: ['api-key-1'],
        },
      },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        status: true,
      },
    });
    expect(rateLimitRuleFindManyMock).toHaveBeenCalledWith({
      where: {
        id: {
          in: ['rule-1'],
        },
      },
      select: {
        id: true,
        name: true,
        scope: true,
        priority: true,
      },
    });
  });
});
