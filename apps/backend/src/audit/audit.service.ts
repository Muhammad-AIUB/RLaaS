import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequestMetadata } from '../common/interfaces/request-metadata.interface';
import { decodeCursor, encodeCursor, twoColumnKeyset } from '../common/utils/cursor';
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

export type PaginatedAuditLogs = {
  data: Array<{
    id: string;
    action: string;
    actorId: string | null;
    projectId: string | null;
    resourceType: string;
    resourceId: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    metadata: Prisma.JsonValue | null;
    createdAt: Date;
    actor: { id: string; email: string; fullName: string } | null;
  }>;
  nextCursor: string | null;
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async log(entry: AuditEntry) {
    try {
      return await this.prismaService.auditLog.create({
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
    } catch (error) {
      this.logger.error(
        `Audit log write failed for action "${entry.action}"`,
        error instanceof Error ? error.stack : undefined,
      );

      return null;
    }
  }

  async listProjectAuditLogs(
    projectId: string,
    query: AuditQueryDto,
  ): Promise<PaginatedAuditLogs> {
    const limit = query.limit ?? 50;
    const secret = this.configService.getOrThrow<string>('JWT_SECRET');
    const cursor = query.cursor ? decodeCursor(query.cursor, secret) : null;

    const where: Prisma.AuditLogWhereInput = {
      projectId,
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
      ...(cursor ? twoColumnKeyset('createdAt', 'desc', cursor) : {}),
    };

    // Fetch limit+1 to detect whether another page exists without a second
    // round-trip.
    const rows = await this.prismaService.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
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

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];

    return {
      data: page,
      nextCursor:
        hasMore && last
          ? encodeCursor(
              {
                createdAt: last.createdAt.toISOString(),
                id: last.id,
              },
              secret,
            )
          : null,
    };
  }
}
