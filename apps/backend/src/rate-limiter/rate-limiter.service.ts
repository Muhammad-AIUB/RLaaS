import { createHash } from 'crypto';
import {
  ApiKeyStatus,
  HttpMethod,
  RequestDecision,
  RuleAlgorithm,
  UserTier,
} from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { AlgorithmRegistryService } from '../algorithms/algorithm-registry.service';
import { RateLimitAlgorithm } from '../algorithms/algorithm.enum';
import { RateLimitResult } from '../algorithms/interfaces/rate-limit-result.interface';
import { GatewayCheckDto } from '../gateway/dto/gateway-check.dto';
import { ProjectGatewayCheckDto } from '../gateway/dto/project-gateway-check.dto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RulesService } from '../rules/rules.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { GatewayCheckResult } from './interfaces/gateway-check-result.interface';
import { ResolvedRateLimitRule } from './interfaces/resolved-rate-limit-rule.interface';

type ApiKeyValidationResult =
  | {
      ok: true;
      apiKey: NonNullable<Awaited<ReturnType<ApiKeysService['findByRawKey']>>>;
    }
  | { ok: false; response: GatewayCheckResult };

type ValidatedApiKey = {
  id: string;
  projectId: string;
  keyPrefix: string;
  status: ApiKeyStatus;
  expiresAt: Date | null;
};

@Injectable()
export class RateLimiterService {
  constructor(
    private readonly configService: ConfigService,
    private readonly algorithmRegistryService: AlgorithmRegistryService,
    private readonly apiKeysService: ApiKeysService,
    private readonly rulesService: RulesService,
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
    private readonly webhooksService: WebhooksService,
  ) {}

  async checkRequest(dto: GatewayCheckDto): Promise<GatewayCheckResult> {
    const validation = await this.validateApiKey(dto.apiKey);

    if (!validation.ok) {
      return validation.response;
    }

    return this.evaluateRequest(dto, validation.apiKey);
  }

  async checkProjectRequest(
    projectId: string,
    dto: ProjectGatewayCheckDto,
  ): Promise<GatewayCheckResult> {
    const apiKey = await this.prismaService.apiKey.findFirst({
      where: {
        id: dto.apiKeyId,
        projectId,
      },
      select: {
        id: true,
        projectId: true,
        keyPrefix: true,
        status: true,
        expiresAt: true,
      },
    });

    if (!apiKey) {
      return this.buildRejectedResponse('API_KEY_INVALID');
    }

    if (apiKey.status === ApiKeyStatus.REVOKED) {
      return this.buildRejectedResponse('API_KEY_REVOKED');
    }

    if (apiKey.expiresAt && apiKey.expiresAt <= new Date()) {
      return this.buildRejectedResponse('API_KEY_REVOKED');
    }

    return this.evaluateRequest(
      {
        apiKey: apiKey.keyPrefix,
        ip: dto.ip,
        endpoint: dto.endpoint,
        method: dto.method,
        userTier: dto.userTier,
      },
      apiKey,
    );
  }

  private async evaluateRequest(
    dto: GatewayCheckDto,
    apiKey: ValidatedApiKey,
  ): Promise<GatewayCheckResult> {
    const redis = this.redisService.getClient();
    const normalizedMethod = dto.method.toUpperCase();
    const normalizedTier = dto.userTier.toUpperCase();

    const idempotencyCacheKey = dto.idempotencyKey
      ? this.buildIdempotencyCacheKey(apiKey.projectId, apiKey.id, {
          ...dto,
          method: normalizedMethod,
          userTier: normalizedTier,
        })
      : null;

    if (idempotencyCacheKey) {
      const cached = await redis.get(idempotencyCacheKey);

      if (cached) {
        const parsed = JSON.parse(cached) as GatewayCheckResult;
        return {
          ...parsed,
          idempotencyStatus: 'replayed',
        };
      }
    }

    const rule =
      (await this.rulesService.findMatchingRule({
        projectId: apiKey.projectId,
        apiKeyId: apiKey.id,
        apiKeyPrefix: apiKey.keyPrefix,
        request: dto,
      })) ?? this.buildDefaultRule();

    const key = this.buildRateLimitKey(
      { ...dto, method: normalizedMethod, userTier: normalizedTier },
      rule,
      apiKey.projectId,
    );

    const result = await this.algorithmRegistryService.get(rule.algorithm).consume({
      key,
      limit: rule.limit,
      windowSeconds: rule.windowSeconds,
      algorithm: rule.algorithm,
    });

    const response: GatewayCheckResult = {
      ...result,
      reason: result.allowed ? undefined : 'RATE_LIMIT_EXCEEDED',
      ruleId: rule.id,
      ruleName: rule.name,
      scope: rule.scope,
      ...(idempotencyCacheKey ? { idempotencyStatus: 'created' } : {}),
    };

    await this.persistRequestOutcome({
      apiKeyId: apiKey.id,
      projectId: apiKey.projectId,
      dto: { ...dto, method: normalizedMethod, userTier: normalizedTier },
      rule,
      result,
      response,
    });

    if (idempotencyCacheKey) {
      await redis.set(
        idempotencyCacheKey,
        JSON.stringify(response),
        'EX',
        Number(this.configService.get('IDEMPOTENCY_TTL_SECONDS', 300)),
      );
    }

    if (!response.allowed) {
      void this.webhooksService.notifyHighBlockedActivity({
        projectId: apiKey.projectId,
        endpoint: dto.endpoint,
        method: normalizedMethod,
        ruleId: rule.id,
        ruleName: rule.name,
        ipAddress: dto.ip,
      });
    }

    return response;
  }

  private buildRateLimitKey(
    dto: Pick<GatewayCheckDto, 'ip' | 'apiKey' | 'endpoint' | 'method' | 'userTier'>,
    rule: ResolvedRateLimitRule,
    projectId: string,
  ): string {
    const scopeValue = this.buildScopeValue(dto, rule);

    return [
      'rlaas',
      projectId,
      rule.algorithm,
      rule.scope,
      scopeValue,
      dto.method.toUpperCase(),
      dto.endpoint,
      dto.userTier.toLowerCase(),
    ].join(':');
  }

  private buildScopeValue(dto: GatewayCheckDto, rule: ResolvedRateLimitRule) {
    switch (rule.scope) {
      case 'IP':
        return dto.ip;
      case 'API_KEY':
        return dto.apiKey;
      case 'USER_TIER':
        return dto.userTier.toLowerCase();
      case 'ENDPOINT':
        return rule.endpointPattern ?? dto.endpoint;
      case 'GLOBAL':
      default:
        return 'global';
    }
  }

  private buildDefaultRule(): ResolvedRateLimitRule {
    return {
      name: 'Default global rule',
      scope: 'GLOBAL',
      algorithm: this.resolveDefaultAlgorithm(),
      limit: Number(
        this.configService.get<number | string>('RATE_LIMIT_DEFAULT_LIMIT', 100),
      ),
      windowSeconds: Number(
        this.configService.get<number | string>(
          'RATE_LIMIT_DEFAULT_WINDOW_SECONDS',
          60,
        ),
      ),
    };
  }

  private async validateApiKey(rawApiKey: string): Promise<ApiKeyValidationResult> {
    const apiKey = await this.apiKeysService.findByRawKey(rawApiKey);

    if (!apiKey) {
      return {
        ok: false,
        response: this.buildRejectedResponse('API_KEY_INVALID'),
      };
    }

    if (apiKey.status === ApiKeyStatus.REVOKED) {
      return {
        ok: false,
        response: this.buildRejectedResponse('API_KEY_REVOKED'),
      };
    }

    if (apiKey.expiresAt && apiKey.expiresAt <= new Date()) {
      return {
        ok: false,
        response: this.buildRejectedResponse('API_KEY_REVOKED'),
      };
    }

    return {
      ok: true,
      apiKey,
    };
  }

  private buildRejectedResponse(
    reason: NonNullable<GatewayCheckResult['reason']>,
  ): GatewayCheckResult {
    return {
      allowed: false,
      reason,
      limit: 0,
      remaining: 0,
      retryAfter: 0,
      algorithm: RateLimitAlgorithm.FIXED_WINDOW,
    };
  }

  private async persistRequestOutcome(params: {
    projectId: string;
    apiKeyId: string;
    dto: Pick<
      GatewayCheckDto,
      'idempotencyKey' | 'ip' | 'endpoint' | 'method' | 'userTier'
    >;
    rule: ResolvedRateLimitRule;
    result: RateLimitResult;
    response: GatewayCheckResult;
  }) {
    const {
      projectId,
      apiKeyId,
      dto,
      rule,
      result,
      response,
    } = params;

    await this.prismaService.requestLog.create({
      data: {
        projectId,
        apiKeyId,
        ruleId: rule.id,
        idempotencyKey: dto.idempotencyKey,
        ipAddress: dto.ip,
        endpoint: dto.endpoint,
        method: dto.method as HttpMethod,
        userTier: this.toPrismaUserTier(dto.userTier),
        decision: result.allowed ? RequestDecision.ALLOWED : RequestDecision.BLOCKED,
        reason: response.reason,
        algorithm: this.toPrismaRuleAlgorithm(rule.algorithm),
        limit: response.limit,
        remaining: response.remaining,
        retryAfter: response.retryAfter,
        metadata: {
          scope: rule.scope,
          ruleName: rule.name,
        },
      },
    });

    await this.prismaService.apiKey.update({
      where: { id: apiKeyId },
      data: {
        lastUsedAt: new Date(),
      },
    });
  }

  private resolveDefaultAlgorithm(): RateLimitAlgorithm {
    const value = this.configService.get<string>(
      'RATE_LIMIT_DEFAULT_ALGORITHM',
      RateLimitAlgorithm.FIXED_WINDOW,
    );

    switch (value) {
      case RateLimitAlgorithm.FIXED_WINDOW:
      case RateLimitAlgorithm.SLIDING_WINDOW_LOG:
      case RateLimitAlgorithm.SLIDING_WINDOW_COUNTER:
      case RateLimitAlgorithm.TOKEN_BUCKET:
        return value;
      default:
        return RateLimitAlgorithm.FIXED_WINDOW;
    }
  }

  private toPrismaRuleAlgorithm(algorithm: RateLimitAlgorithm): RuleAlgorithm {
    switch (algorithm) {
      case RateLimitAlgorithm.FIXED_WINDOW:
        return RuleAlgorithm.FIXED_WINDOW;
      case RateLimitAlgorithm.SLIDING_WINDOW_LOG:
        return RuleAlgorithm.SLIDING_WINDOW_LOG;
      case RateLimitAlgorithm.SLIDING_WINDOW_COUNTER:
        return RuleAlgorithm.SLIDING_WINDOW_COUNTER;
      case RateLimitAlgorithm.TOKEN_BUCKET:
        return RuleAlgorithm.TOKEN_BUCKET;
      default:
        return RuleAlgorithm.FIXED_WINDOW;
    }
  }

  private toPrismaUserTier(userTier: string): UserTier | null {
    switch (userTier.toUpperCase()) {
      case UserTier.FREE:
        return UserTier.FREE;
      case UserTier.PRO:
        return UserTier.PRO;
      case UserTier.BUSINESS:
        return UserTier.BUSINESS;
      case UserTier.ENTERPRISE:
        return UserTier.ENTERPRISE;
      default:
        return null;
    }
  }

  private buildIdempotencyCacheKey(
    projectId: string,
    apiKeyId: string,
    dto: Pick<GatewayCheckDto, 'idempotencyKey' | 'ip' | 'endpoint' | 'method' | 'userTier'>,
  ) {
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          apiKeyId,
          ip: dto.ip,
          endpoint: dto.endpoint,
          method: dto.method,
          userTier: dto.userTier,
        }),
      )
      .digest('hex');

    return ['rlaas', 'idempotency', projectId, dto.idempotencyKey, fingerprint].join(
      ':',
    );
  }
}
