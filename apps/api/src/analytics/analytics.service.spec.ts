import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  const countMock = jest.fn();
  const groupByMock = jest.fn();
  const findManyMock = jest.fn();
  const upsertMock = jest.fn();
  const getByIdMock = jest.fn();

  const prismaService = {
    requestLog: {
      count: countMock,
      groupBy: groupByMock,
      findMany: findManyMock,
    },
    analyticsSnapshot: {
      upsert: upsertMock,
      findMany: findManyMock,
    },
  } as unknown as PrismaService;

  const projectsService = {
    getById: getByIdMock,
  } as unknown as ProjectsService;

  const service = new AnalyticsService(prismaService, projectsService);

  beforeEach(() => {
    countMock.mockReset();
    groupByMock.mockReset();
    findManyMock.mockReset();
    upsertMock.mockReset();
    getByIdMock.mockReset();
    getByIdMock.mockResolvedValue({});
  });

  it('computes overview totals and block rate', async () => {
    countMock
      .mockResolvedValueOnce(200)
      .mockResolvedValueOnce(150)
      .mockResolvedValueOnce(50);

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
    countMock
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(80)
      .mockResolvedValueOnce(20);
    groupByMock
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
});
