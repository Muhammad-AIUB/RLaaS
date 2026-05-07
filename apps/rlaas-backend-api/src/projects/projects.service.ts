import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { toSlug } from '../common/utils/slug.util';

@Injectable()
export class ProjectsService {
  constructor(private readonly prismaService: PrismaService) {}

  async create(ownerId: string, dto: CreateProjectDto) {
    const slug = await this.generateUniqueSlug(dto.name);

    return this.prismaService.project.create({
      data: {
        ownerId,
        name: dto.name,
        slug,
        description: dto.description,
        environment: dto.environment ?? 'production',
        isActive: dto.isActive ?? true,
      },
      include: {
        _count: {
          select: {
            apiKeys: true,
            rules: true,
          },
        },
      },
    });
  }

  listByOwner(ownerId: string) {
    return this.prismaService.project.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            apiKeys: true,
            rules: true,
          },
        },
      },
    });
  }

  async getById(ownerId: string, projectId: string) {
    const project = await this.prismaService.project.findFirst({
      where: {
        id: projectId,
        ownerId,
      },
      include: {
        _count: {
          select: {
            apiKeys: true,
            rules: true,
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  async update(ownerId: string, projectId: string, dto: UpdateProjectDto) {
    await this.getById(ownerId, projectId);

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

    return this.prismaService.project.update({
      where: { id: projectId },
      data,
      include: {
        _count: {
          select: {
            apiKeys: true,
            rules: true,
          },
        },
      },
    });
  }

  async delete(ownerId: string, projectId: string) {
    await this.getById(ownerId, projectId);

    await this.prismaService.project.delete({
      where: { id: projectId },
    });

    return {
      success: true,
    };
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
}
