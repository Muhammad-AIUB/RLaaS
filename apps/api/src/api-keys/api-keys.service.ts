import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApiKeyStatus } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  async create(ownerId: string, projectId: string, dto: CreateApiKeyDto) {
    await this.projectsService.getById(ownerId, projectId);

    const plainKey = this.generateApiKey();
    const keyPrefix = plainKey.slice(0, 18);
    const hashedKey = this.hashApiKey(plainKey);

    const apiKey = await this.prismaService.apiKey.create({
      data: {
        projectId,
        name: dto.name,
        keyPrefix,
        hashedKey,
        expiresAt: dto.expiresAt,
      },
    });

    return {
      ...apiKey,
      key: plainKey,
    };
  }

  async listByProject(ownerId: string, projectId: string) {
    await this.projectsService.getById(ownerId, projectId);

    return this.prismaService.apiKey.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revoke(ownerId: string, projectId: string, apiKeyId: string) {
    await this.projectsService.getById(ownerId, projectId);

    const existing = await this.prismaService.apiKey.findFirst({
      where: {
        id: apiKeyId,
        projectId,
      },
    });

    if (!existing) {
      throw new NotFoundException('API key not found');
    }

    return this.prismaService.apiKey.update({
      where: { id: apiKeyId },
      data: {
        status: ApiKeyStatus.REVOKED,
      },
    });
  }

  findByRawKey(rawKey: string) {
    const hashedKey = this.hashApiKey(rawKey);

    return this.prismaService.apiKey.findUnique({
      where: {
        hashedKey,
      },
      include: {
        project: true,
      },
    });
  }

  private generateApiKey() {
    return `rlaas_live_${randomBytes(24).toString('hex')}`;
  }

  private hashApiKey(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
}
