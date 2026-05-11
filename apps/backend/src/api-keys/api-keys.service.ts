import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApiKeyStatus, ProjectRole } from '@prisma/client';
import { createHmac, randomBytes } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { RequestMetadata } from '../common/interfaces/request-metadata.interface';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { RedisService } from '../redis/redis.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

const API_KEY_CACHE_TTL = 30;
const API_KEY_LIST_TTL = 60;

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly auditService: AuditService,
    private readonly redisService: RedisService,
  ) {}

  async create(
    userId: string,
    projectId: string,
    dto: CreateApiKeyDto,
    request?: RequestMetadata,
  ) {
    await this.projectsService.assertProjectAccess(userId, projectId, [
      ProjectRole.OWNER,
      ProjectRole.ADMIN,
    ]);

    const plainKey = this.generateApiKey();
    const keyPrefix = plainKey.slice(0, 18);
    const hashedKey = this.hashApiKey(plainKey);

    const apiKey = await this.prismaService.apiKey.create({
      data: {
        projectId,
        name: dto.name,
        keyPrefix,
        hashedKey,
        hashVersion: 'hmac-sha256-v1',
        expiresAt: dto.expiresAt,
      },
    });

    void this.auditService.log({
      action: 'api_key.created',
      actorId: userId,
      projectId,
      resourceType: 'api_key',
      resourceId: apiKey.id,
      metadata: {
        name: apiKey.name,
        keyPrefix: apiKey.keyPrefix,
        expiresAt: apiKey.expiresAt?.toISOString() ?? null,
      },
      request,
    });

    await this.bustApiKeyListCache(projectId);
    return {
      ...apiKey,
      key: plainKey,
    };
  }

  private apiKeyListKey(projectId: string) {
    return `cache:apikeys:project:${projectId}`;
  }

  private async bustApiKeyListCache(projectId: string) {
    try {
      await this.redisService.getClient().del(this.apiKeyListKey(projectId));
    } catch { /* non-critical */ }
  }

  async listByProject(userId: string, projectId: string) {
    const key = this.apiKeyListKey(projectId);
    try {
      const cached = await this.redisService.getClient().get(key);
      if (cached) return JSON.parse(cached);
    } catch { /* fall through */ }

    await this.projectsService.assertProjectAccess(userId, projectId, [
      ProjectRole.OWNER,
      ProjectRole.ADMIN,
      ProjectRole.VIEWER,
    ]);

    const apiKeys = await this.prismaService.apiKey.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });

    try {
      await this.redisService.getClient().setex(key, API_KEY_LIST_TTL, JSON.stringify(apiKeys));
    } catch { /* non-critical */ }

    return apiKeys;
  }

  async revoke(
    userId: string,
    projectId: string,
    apiKeyId: string,
    request?: RequestMetadata,
  ) {
    await this.projectsService.assertProjectAccess(userId, projectId, [
      ProjectRole.OWNER,
      ProjectRole.ADMIN,
    ]);

    const existing = await this.prismaService.apiKey.findFirst({
      where: {
        id: apiKeyId,
        projectId,
      },
    });

    if (!existing) {
      throw new NotFoundException('API key not found');
    }

    const apiKey = await this.prismaService.apiKey.update({
      where: { id: apiKeyId },
      data: {
        status: ApiKeyStatus.REVOKED,
      },
    });

    // Bust the gateway cache for this key so revocation is instant
    void this.bustApiKeyCache(existing.hashedKey);
    void this.bustApiKeyListCache(projectId);

    void this.auditService.log({
      action: 'api_key.revoked',
      actorId: userId,
      projectId,
      resourceType: 'api_key',
      resourceId: apiKeyId,
      metadata: {
        keyPrefix: apiKey.keyPrefix,
      },
      request,
    });

    return apiKey;
  }

  async findByRawKey(rawKey: string) {
    const hashedKey = this.hashApiKey(rawKey);
    const cacheKey = `cache:apikey:${hashedKey}`;

    try {
      const cached = await this.redisService.getClient().get(cacheKey);
      if (cached) return JSON.parse(cached) as Awaited<ReturnType<typeof this._findByHashedKey>>;
    } catch { /* fall through */ }

    const apiKey = await this._findByHashedKey(hashedKey);

    if (apiKey) {
      try {
        await this.redisService.getClient().setex(cacheKey, API_KEY_CACHE_TTL, JSON.stringify(apiKey));
      } catch { /* non-critical */ }
    }

    return apiKey;
  }

  private _findByHashedKey(hashedKey: string) {
    return this.prismaService.apiKey.findUnique({
      where: { hashedKey },
      select: {
        id: true,
        projectId: true,
        keyPrefix: true,
        status: true,
        expiresAt: true,
      },
    });
  }

  private async bustApiKeyCache(hashedKey: string) {
    try {
      await this.redisService.getClient().del(`cache:apikey:${hashedKey}`);
    } catch { /* non-critical */ }
  }

  private generateApiKey() {
    return `rlaas_live_${randomBytes(24).toString('hex')}`;
  }

  private hashApiKey(value: string) {
    return createHmac('sha256', this.resolveHashPepper()).update(value).digest('hex');
  }

  private resolveHashPepper() {
    return process.env.API_KEY_HASH_PEPPER || process.env.JWT_SECRET || 'change-me';
  }
}
