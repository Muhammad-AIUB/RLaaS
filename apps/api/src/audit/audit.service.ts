import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequestMetadata } from '../common/interfaces/request-metadata.interface';
import { AuditQueryDto } from './dto/audit-query.dto';

type AuditEntry = {
  action: string;
  actorId?: string | null;
  projectId?: string | null;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  request?: RequestMetadata;
};

@Injectable()
export class AuditService {
  constructor(private readonly prismaService: PrismaService) {}

  log(entry: AuditEntry) {
    return this.prismaService.auditLog.create({
      data: {
        action: entry.action,
        actorId: entry.actorId ?? null,
        projectId: entry.projectId ?? null,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId ?? null,
        ipAddress: entry.request?.ipAddress ?? null,
        userAgent: entry.request?.userAgent ?? null,
        metadata: entry.metadata ?? undefined,
      },
    });
  }

  listProjectAuditLogs(projectId: string, query: AuditQueryDto) {
    return this.prismaService.auditLog.findMany({
      where: {
        projectId,
        ...(query.from || query.to
          ? {
              createdAt: {
                ...(query.from ? { gte: query.from } : {}),
                ...(query.to ? { lte: query.to } : {}),
              },
            }
          : {}),
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: query.limit ?? 50,
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            fullName: true,
          },
        },
      },
    });
  }
}
