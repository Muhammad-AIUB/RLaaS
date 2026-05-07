import {
  ApiKeyStatus,
  HttpMethod,
  RequestDecision,
  RuleAlgorithm,
  UserTier,
} from '@prisma/client';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { AlgorithmRegistryService } from '../algorithms/algorithm-registry.service';
import { RateLimitAlgorithm } from '../algorithms/algorithm.enum';
import { GatewayCheckDto } from '../gateway/dto/gateway-check.dto';
import { PrismaService } from '../prisma/prisma.service';
import { RulesService } from '../rules/rules.service';
import { GatewayCheckResult } from './interfaces/gateway-check-result.interface';
import { ResolvedRateLimitRule } from './interfaces/resolved-rate-limit-rule.interface';
import { mapRuleAlgorithm } from './utils/rule-algorithm.util';

@Injectable()
export class RateLimiterService {
  constructor(
    private readonly configService: ConfigService,
    private readonly algorithmRegistryService: AlgorithmRegistryService,
    private readonly apiKeysService: ApiKeysService,
    private readonly rulesService: RulesService,
    private readonly prismaService: PrismaService,
  ) {}

  async checkRequest(dto: GatewayCheckDto): Promise<GatewayCheckResult> {
    const apiKey = await this.apiKeysService.findByRawKey(dto.apiKey);

    if (!apiKey) {
      return {
        allowed: false,
        reason: 'API_KEY_INVALID',
        limit: 0,
        remaining: 0,
        retryAfter: 0,
        algorithm: RateLimitAlgorithm.FIXED_WINDOW,
      };
    }

    if (apiKey.status === ApiKeyStatus.REVOKED) {
      return {
        allowed: false,
        reason: 'API_KEY_REVOKED',
        limit: 0,
        remaining: 0,
        retryAfter: 0,
        algorithm: RateLimitAlgorithm.FIXED_WINDOW,
      };
    }

    if (apiKey.expiresAt && apiKey.expiresAt <= new Date()) {
      return {
        allowed: false,
        reason: 'API_KEY_REVOKED',
        limit: 0,
        remaining: 0,
        retryAfter: 0,
        algorithm: RateLimitAlgorithm.FIXED_WINDOW,
      };
    }

    const rule =
      (await this.rulesService.findMatchingRule({
        projectId: apiKey.projectId,
        apiKeyId: apiKey.id,
        apiKeyPrefix: apiKey.keyPrefix,
        request: dto,
      })) ?? this.buildDefaultRule();

    const key = this.buildRateLimitKey(dto, rule, apiKey.projectId);

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
    };

    await this.prismaService.requestLog.create({
      data: {
        projectId: apiKey.projectId,
        apiKeyId: apiKey.id,
        ruleId: rule.id,
        ipAddress: dto.ip,
        endpoint: dto.endpoint,
        method: dto.method.toUpperCase() as HttpMethod,
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
      where: { id: apiKey.id },
      data: {
        lastUsedAt: new Date(),
      },
    });

    return response;
  }

  private buildRateLimitKey(
    dto: GatewayCheckDto,
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
}
