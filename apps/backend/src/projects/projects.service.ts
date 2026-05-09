import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProjectRole } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { RequestMetadata } from '../common/interfaces/request-metadata.interface';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { ProjectAccessService } from './project-access.service';
import {
  PROJECT_OWNER_ONLY_ROLES,
  PROJECT_READ_ROLES,
  PROJECT_WRITE_ROLES,
} from './projects.constants';
import { AddProjectMemberDto } from './dto/add-project-member.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectMemberRoleDto } from './dto/update-project-member-role.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { toSlug } from '../common/utils/slug.util';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditService: AuditService,
    private readonly usersService: UsersService,
    private readonly projectAccessService: ProjectAccessService,
  ) {}

  async create(userId: string, dto: CreateProjectDto, request?: RequestMetadata) {
    const slug = await this.generateUniqueSlug(dto.name);

    const project = await this.prismaService.project.create({
      data: {
        ownerId: userId,
        name: dto.name,
        slug,
        description: dto.description,
        environment: dto.environment ?? 'production',
        isActive: dto.isActive ?? true,
        members: {
          create: {
            userId,
            role: ProjectRole.OWNER,
          },
        },
      },
      include: this.buildProjectInclude(userId),
    });

    await this.auditService.log({
      action: 'project.created',
      actorId: userId,
      projectId: project.id,
      resourceType: 'project',
      resourceId: project.id,
      metadata: {
        name: project.name,
        environment: project.environment,
      },
      request,
    });

    return this.attachCurrentRole(project);
  }

  async listByUser(userId: string) {
    const projects = await this.prismaService.project.findMany({
      where: {
        members: {
          some: { userId },
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            apiKeys: true,
            rules: true,
          },
        },
        members: {
          where: { userId },
          select: { id: true, role: true },
        },
      },
    });

    return projects.map((project) => this.attachCurrentRole(project));
  }

  async getById(userId: string, projectId: string) {
    await this.assertProjectAccess(userId, projectId, PROJECT_READ_ROLES);

    const project = await this.prismaService.project.findFirst({
      where: {
        id: projectId,
      },
      include: this.buildProjectInclude(userId),
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return this.attachCurrentRole(project);
  }

  async update(
    userId: string,
    projectId: string,
    dto: UpdateProjectDto,
    request?: RequestMetadata,
  ) {
    await this.assertProjectAccess(userId, projectId, PROJECT_WRITE_ROLES);
    const data = await this.buildProjectUpdateData(dto, projectId);

    const project = await this.prismaService.project.update({
      where: { id: projectId },
      data,
      include: this.buildProjectInclude(userId),
    });

    await this.auditService.log({
      action: 'project.updated',
      actorId: userId,
      projectId,
      resourceType: 'project',
      resourceId: projectId,
      metadata: data,
      request,
    });

    return this.attachCurrentRole(project);
  }

  async delete(userId: string, projectId: string, request?: RequestMetadata) {
    await this.assertProjectAccess(userId, projectId, PROJECT_OWNER_ONLY_ROLES);

    await this.prismaService.project.delete({
      where: { id: projectId },
    });

    await this.auditService.log({
      action: 'project.deleted',
      actorId: userId,
      projectId,
      resourceType: 'project',
      resourceId: projectId,
      request,
    });

    return {
      success: true,
    };
  }

  async listMembers(userId: string, projectId: string) {
    await this.assertProjectAccess(userId, projectId, PROJECT_WRITE_ROLES);

    return this.prismaService.projectMember.findMany({
      where: { projectId },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            tier: true,
          },
        },
      },
    });
  }

  async addMember(
    actorId: string,
    projectId: string,
    dto: AddProjectMemberDto,
    request?: RequestMetadata,
  ) {
    await this.assertProjectAccess(actorId, projectId, PROJECT_OWNER_ONLY_ROLES);

    const user = await this.usersService.findByEmail(dto.email);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const member = await this.prismaService.projectMember.upsert({
      where: {
        projectId_userId: {
          projectId,
          userId: user.id,
        },
      },
      update: {
        role: user.id === actorId ? ProjectRole.OWNER : dto.role,
      },
      create: {
        projectId,
        userId: user.id,
        role: user.id === actorId ? ProjectRole.OWNER : dto.role,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            tier: true,
          },
        },
      },
    });

    await this.auditService.log({
      action: 'project.member_added',
      actorId,
      projectId,
      resourceType: 'project_member',
      resourceId: member.id,
      metadata: {
        userId: user.id,
        email: user.email,
        role: member.role,
      },
      request,
    });

    return member;
  }

  async updateMemberRole(
    actorId: string,
    projectId: string,
    memberId: string,
    dto: UpdateProjectMemberRoleDto,
    request?: RequestMetadata,
  ) {
    await this.assertProjectAccess(actorId, projectId, PROJECT_OWNER_ONLY_ROLES);

    const member = await this.prismaService.projectMember.findFirst({
      where: {
        id: memberId,
        projectId,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            tier: true,
          },
        },
      },
    });

    if (!member) {
      throw new NotFoundException('Project member not found');
    }

    await this.ensureMutableMember(projectId, member.userId, {
      ownerMessage: 'The project owner role cannot be changed',
    });

    const updated = await this.prismaService.projectMember.update({
      where: { id: memberId },
      data: { role: dto.role },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            tier: true,
          },
        },
      },
    });

    await this.auditService.log({
      action: 'project.member_role_updated',
      actorId,
      projectId,
      resourceType: 'project_member',
      resourceId: memberId,
      metadata: {
        userId: updated.userId,
        role: updated.role,
      },
      request,
    });

    return updated;
  }

  async removeMember(
    actorId: string,
    projectId: string,
    memberId: string,
    request?: RequestMetadata,
  ) {
    await this.assertProjectAccess(actorId, projectId, PROJECT_OWNER_ONLY_ROLES);

    const member = await this.prismaService.projectMember.findFirst({
      where: {
        id: memberId,
        projectId,
      },
    });

    if (!member) {
      throw new NotFoundException('Project member not found');
    }

    await this.ensureMutableMember(projectId, member.userId, {
      ownerMessage: 'The project owner cannot be removed',
    });

    await this.prismaService.projectMember.delete({
      where: { id: memberId },
    });

    await this.auditService.log({
      action: 'project.member_removed',
      actorId,
      projectId,
      resourceType: 'project_member',
      resourceId: memberId,
      metadata: {
        userId: member.userId,
      },
      request,
    });

    return { success: true };
  }

  async assertProjectAccess(
    userId: string,
    projectId: string,
    allowedRoles: readonly ProjectRole[],
  ) {
    return this.projectAccessService.assertAccess(userId, projectId, allowedRoles);
  }

  private async generateUniqueSlug(name: string, excludeProjectId?: string) {
    const baseSlug = toSlug(name) || 'project';
    let candidate = baseSlug;
    let counter = 1;

    for (;;) {
      const existing = await this.prismaService.project.findFirst({
        where: {
          slug: candidate,
          ...(excludeProjectId
            ? {
                id: {
                  not: excludeProjectId,
                },
              }
            : {}),
        },
      });

      if (!existing) {
        return candidate;
      }

      counter += 1;
      candidate = `${baseSlug}-${counter}`;
    }
  }

  private buildProjectInclude(userId: string) {
    return {
      _count: {
        select: {
          apiKeys: true,
          rules: true,
        },
      },
      members: {
        where: { userId },
        select: { id: true, role: true },
      },
    } as const;
  }

  private async buildProjectUpdateData(dto: UpdateProjectDto, projectId: string) {
    const data: {
      name?: string;
      slug?: string;
      description?: string | null;
      environment?: string;
      isActive?: boolean;
    } = {};

    if (dto.name) {
      data.name = dto.name;
      data.slug = await this.generateUniqueSlug(dto.name, projectId);
    }

    if (dto.description !== undefined) {
      data.description = dto.description;
    }

    if (dto.environment !== undefined) {
      data.environment = dto.environment;
    }

    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }

    return data;
  }

  private async ensureMutableMember(
    projectId: string,
    memberUserId: string,
    messages: { ownerMessage: string },
  ) {
    try {
      await this.projectAccessService.ensureMemberIsNotOwner(projectId, memberUserId);
    } catch (error) {
      if (error instanceof ConflictException) {
        throw new ConflictException(messages.ownerMessage);
      }

      throw error;
    }
  }

  private attachCurrentRole<T extends { members?: Array<{ role: ProjectRole }> }>(
    project: T,
  ) {
    const currentRole = project.members?.[0]?.role;

    return {
      ...project,
      currentRole,
    };
  }
}
