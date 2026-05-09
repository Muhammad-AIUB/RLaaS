import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ProjectRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProjectAccessService {
  private readonly logger = new Logger(ProjectAccessService.name);
  private readonly membershipLookupInFlight = new Map<
    string,
    Promise<{ role: ProjectRole } | null>
  >();

  constructor(private readonly prismaService: PrismaService) {}

  async assertAccess(
    userId: string,
    projectId: string,
    allowedRoles: readonly ProjectRole[],
  ) {
    const accessCheckStartNs = process.hrtime.bigint();
    const userLookupStartNs = process.hrtime.bigint();
    const normalizedUserId = userId;
    const userLookupMs = Number(process.hrtime.bigint() - userLookupStartNs) / 1_000_000;

    const memberLookupStartNs = process.hrtime.bigint();
    const membershipLookupKey = `${projectId}:${normalizedUserId}`;
    const sharedLookup =
      this.membershipLookupInFlight.has(membershipLookupKey);
    const membership = await this.getMembership(
      membershipLookupKey,
      projectId,
      normalizedUserId,
    );
    const memberLookupMs = Number(process.hrtime.bigint() - memberLookupStartNs) / 1_000_000;
    const totalAccessCheckMs = Number(process.hrtime.bigint() - accessCheckStartNs) / 1_000_000;

    this.logger.debug(
      `Project access check timings userLookupMs=${userLookupMs.toFixed(2)} projectMemberLookupMs=${memberLookupMs.toFixed(2)} totalMs=${totalAccessCheckMs.toFixed(2)} sharedLookup=${sharedLookup} projectId=${projectId} allowedRoles=${allowedRoles.join(',')}`,
    );

    if (!membership) {
      throw new NotFoundException('Project not found');
    }

    if (!allowedRoles.includes(membership.role)) {
      throw new ForbiddenException('You do not have access to this project action');
    }

    return membership;
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

  private async getMembership(
    key: string,
    projectId: string,
    userId: string,
  ): Promise<{ role: ProjectRole } | null> {
    const existingLookup = this.membershipLookupInFlight.get(key);
    if (existingLookup) {
      return existingLookup;
    }

    const lookupPromise = this.prismaService.projectMember
      .findUnique({
        where: {
          projectId_userId: {
            projectId,
            userId,
          },
        },
        select: {
          role: true,
        },
      })
      .finally(() => {
        this.membershipLookupInFlight.delete(key);
      });

    this.membershipLookupInFlight.set(key, lookupPromise);

    return lookupPromise;
  }
}
