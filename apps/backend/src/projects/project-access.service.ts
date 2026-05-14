import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ProjectRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const MEMBERSHIP_TTL = 120; // 2 minutes

@Injectable()
export class ProjectAccessService {
  private readonly logger = new Logger(ProjectAccessService.name);
  private readonly membershipLookupInFlight = new Map<
    string,
    Promise<{ role: ProjectRole } | null>
  >();

  constructor(
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async assertAccess(
    userId: string,
    projectId: string,
    allowedRoles: readonly ProjectRole[],
  ) {
    const membership = await this.getMembership(
      `${projectId}:${userId}`,
      projectId,
      userId,
    );

    if (!membership) {
      throw new NotFoundException('Project not found');
    }

    if (!allowedRoles.includes(membership.role)) {
      throw new ForbiddenException('You do not have access to this project action');
    }

    return membership;
  }

  async bustMembershipCache(projectId: string, userId: string) {
    try {
      await this.redisService.getClient().del(this.membershipCacheKey(projectId, userId));
    } catch { /* non-critical */ }
  }

  async ensureMemberIsNotOwner(projectId: string, memberUserId: string) {
    const project = await this.prismaService.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    });

    if (project?.ownerId === memberUserId) {
      throw new ConflictException('The project owner cannot be modified');
    }
  }

  private membershipCacheKey(projectId: string, userId: string) {
    return `cache:membership:${projectId}:${userId}`;
  }

  private async getMembership(
    key: string,
    projectId: string,
    userId: string,
  ): Promise<{ role: ProjectRole } | null> {
    // 1. Redis cache
    try {
      const cacheKey = this.membershipCacheKey(projectId, userId);
      const cached = await this.redisService.getClient().get(cacheKey);
      if (cached) return JSON.parse(cached) as { role: ProjectRole };
    } catch { /* fall through */ }

    // 2. In-flight deduplication
    const existingLookup = this.membershipLookupInFlight.get(key);
    if (existingLookup) {
      return existingLookup;
    }

    const lookupPromise = this.prismaService.projectMember
      .findUnique({
        where: { projectId_userId: { projectId, userId } },
        select: { role: true },
      })
      .then(async (result) => {
        if (result) {
          try {
            const cacheKey = this.membershipCacheKey(projectId, userId);
            await this.redisService.getClient().setex(
              cacheKey,
              MEMBERSHIP_TTL,
              JSON.stringify(result),
            );
          } catch { /* non-critical */ }
        }
        return result;
      })
      .finally(() => {
        this.membershipLookupInFlight.delete(key);
      });

    this.membershipLookupInFlight.set(key, lookupPromise);

    return lookupPromise;
  }
}
