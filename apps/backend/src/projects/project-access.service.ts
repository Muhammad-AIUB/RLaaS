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

  constructor(private readonly prismaService: PrismaService) {}

  async assertAccess(
    userId: string,
    projectId: string,
    allowedRoles: readonly ProjectRole[],
  ) {
    const accessCheckStart = Date.now();
    const userLookupStart = Date.now();
    const normalizedUserId = userId;
    const userLookupMs = Date.now() - userLookupStart;

    const memberLookupStart = Date.now();
    const membership = await this.prismaService.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId: normalizedUserId,
        },
      },
      select: {
        role: true,
      },
    });
    const memberLookupMs = Date.now() - memberLookupStart;
    const totalAccessCheckMs = Date.now() - accessCheckStart;

    this.logger.debug(
      `Project access check timings userLookupMs=${userLookupMs} projectMemberLookupMs=${memberLookupMs} totalMs=${totalAccessCheckMs} projectId=${projectId}`,
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
}
