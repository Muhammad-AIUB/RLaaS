import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProjectRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProjectAccessService {
  constructor(private readonly prismaService: PrismaService) {}

  async assertAccess(
    userId: string,
    projectId: string,
    allowedRoles: readonly ProjectRole[],
  ) {
    const membership = await this.prismaService.projectMember.findFirst({
      where: {
        projectId,
        userId,
      },
      include: {
        project: {
          select: {
            id: true,
            ownerId: true,
            name: true,
            slug: true,
            environment: true,
            isActive: true,
          },
        },
      },
    });

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
