import { createHash } from 'crypto';
import {
  ApiKeyStatus,
  HttpMethod,
  RequestDecision,
  RuleAlgorithm,
  UserTier,
} from '@prisma/client';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { AlgorithmRegistryService } from '../algorithms/algorithm-registry.service';
import { RateLimitAlgorithm } from '../algorithms/algorithm.enum';
import { RateLimitResult } from '../algorithms/interfaces/rate-limit-result.interface';
import { measure } from '../common/timing/request-timing';
import { GatewayCheckDto } from '../gateway/dto/gateway-check.dto';
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

@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly algorithmRegistryService: AlgorithmRegistryService,
    private readonly apiKeysService: ApiKeysService,
    private readonly rulesService: RulesService,
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
    private readonly webhooksService: WebhooksService,
  ) {}

  async checkProjectRequest(
    projectId: string,
    dto: {
      apiKeyId: string;
      ip: string;
      endpoint: string;
      method: HttpMethod;
      userTier: string;
    },
  ): Promise<GatewayCheckResult> {
    const apiKey = await this.prismaService.apiKey.findFirst({
      where: { id: dto.apiKeyId, projectId },
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

    const normalizedMethod = dto.method;
    const normalizedTier = dto.userTier.toUpperCase();
    const proxyDto: GatewayCheckDto = {
      apiKey: apiKey.id,
      ip: dto.ip,
      endpoint: dto.endpoint,
      method: normalizedMethod,
      userTier: normalizedTier,
    };

    const rule =
      (await this.rulesService.findMatchingRule({
        projectId: apiKey.projectId,
        apiKeyId: apiKey.id,
        apiKeyPrefix: apiKey.keyPrefix,
        request: proxyDto,
      })) ?? this.buildDefaultRule();

    const key = this.buildRateLimitKey(proxyDto, rule, projectId, apiKey.id);

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

    void this.persistRequestOutcome({
      apiKeyId: apiKey.id,
      projectId: apiKey.projectId,
      dto: proxyDto,
      rule,
      result,
      response,
    }).catch((error: unknown) =>
      this.logDeferredFailure('persistRequestOutcome', error),
    );

    if (!response.allowed) {
      void this.webhooksService
        .notifyHighBlockedActivity({
          projectId: apiKey.projectId,
          endpoint: dto.endpoint,
          method: normalizedMethod,
          ruleId: rule.id,
          ruleName: rule.name,
          ipAddress: dto.ip,
        })
        .catch((error: unknown) =>
          this.logDeferredFailure('notifyHighBlockedActivity', error),
        );
    }

    return response;
  }

  async checkRequest(dto: GatewayCheckDto): Promise<GatewayCheckResult> {
    const redis = this.redisService.getClient();
    const validation = await measure('apikey', () =>
      this.validateApiKey(dto.apiKey),
    );

    if (!validation.ok) {
      return validation.response;
    }

    const { apiKey } = validation;
    // GatewayCheckDto uppercases and enum-validates `method` before it gets
    // here, so it arrives already normalized and typed.
    const normalizedMethod = dto.method;
    const normalizedTier = dto.userTier.toUpperCase();

    const idempotencyCacheKey = dto.idempotencyKey
      ? this.buildIdempotencyCacheKey(apiKey.projectId, apiKey.id, {
          ...dto,
          method: normalizedMethod,
          userTier: normalizedTier,
        })
      : null;

    if (idempotencyCacheKey) {
      const cached = await measure('idem', () => redis.get(idempotencyCacheKey));

      if (cached) {
        const parsed = JSON.parse(cached) as GatewayCheckResult;
        return {
          ...parsed,
          idempotencyStatus: 'replayed',
        };
      }
    }

    const rule =
      (await measure('rules', () =>
        this.rulesService.findMatchingRule({
          projectId: apiKey.projectId,
          apiKeyId: apiKey.id,
          apiKeyPrefix: apiKey.keyPrefix,
          request: dto,
        }),
      )) ?? this.buildDefaultRule();

    const key = this.buildRateLimitKey(
      { ...dto, method: normalizedMethod, userTier: normalizedTier },
      rule,
      apiKey.projectId,
      apiKey.id,
    );

    const result = await measure('redis', () =>
      this.algorithmRegistryService.get(rule.algorithm).consume({
        key,
        limit: rule.limit,
        windowSeconds: rule.windowSeconds,
        algorithm: rule.algorithm,
      }),
    );

    const response: GatewayCheckResult = {
      ...result,
      reason: result.allowed ? undefined : 'RATE_LIMIT_EXCEEDED',
      ruleId: rule.id,
      ruleName: rule.name,
      scope: rule.scope,
      ...(idempotencyCacheKey ? { idempotencyStatus: 'created' } : {}),
    };

    void this.persistRequestOutcome({
      apiKeyId: apiKey.id,
      projectId: apiKey.projectId,
      dto: { ...dto, method: normalizedMethod, userTier: normalizedTier },
      rule,
      result,
      response,
    }).catch((error: unknown) =>
      this.logDeferredFailure('persistRequestOutcome', error),
    );

    if (idempotencyCacheKey) {
      await measure('idem', () =>
        redis.set(
          idempotencyCacheKey,
          JSON.stringify(response),
          'EX',
          Number(this.configService.get('IDEMPOTENCY_TTL_SECONDS', 300)),
        ),
      );
    }

    if (!response.allowed) {
      void this.webhooksService
        .notifyHighBlockedActivity({
          projectId: apiKey.projectId,
          endpoint: dto.endpoint,
          method: normalizedMethod,
          ruleId: rule.id,
          ruleName: rule.name,
          ipAddress: dto.ip,
        })
        .catch((error: unknown) =>
          this.logDeferredFailure('notifyHighBlockedActivity', error),
        );
    }

    return response;
  }

  /**
   * The counter identity is (project, rule, scope value) and nothing else.
   *
   * This used to append the request's method, endpoint and userTier to EVERY
   * key regardless of scope. All three are chosen by the caller, so a rule
   * declaring "GLOBAL, 5 per 300s" actually issued a fresh budget of 5 for
   * each (method, endpoint, tier) tuple that was sent: measured against a live
   * server, one such rule allowed 18 of 19 requests. Anyone holding a valid
   * key evaded their limit by varying the path, and each variation left a
   * permanent counter behind, so an attacker also controlled Redis key growth.
   *
   * A rule limits what it matches. Two requests that match the same rule with
   * the same scope value share one budget — that is what declaring a limit
   * means. Constraints the rule itself carries (method, userTier, endpoint
   * pattern) are already applied by RulesService#findMatchingRule, so a
   * request that reaches here has passed them and belongs in the same bucket.
   *
   * `algorithm` stays in the key because each one stores a different Redis
   * type (a string for fixed window, a hash for token bucket). Without it,
   * editing a rule's algorithm would hit the old key and fail with WRONGTYPE.
   */
  private buildRateLimitKey(
    dto: Pick<GatewayCheckDto, 'ip' | 'endpoint' | 'method' | 'userTier'>,
    rule: ResolvedRateLimitRule,
    projectId: string,
    apiKeyId: string,
  ): string {
    return [
      'rlaas',
      projectId,
      rule.algorithm,
      rule.scope,
      this.buildScopeValue(dto, rule, apiKeyId),
      rule.id ?? 'default',
    ].join(':');
  }

  /**
   * The API_KEY scope keys on the key's id, never on the raw key.
   *
   * Redis key names are not secret: they show up in KEYS/SCAN, MONITOR,
   * SLOWLOG, RDB dumps and any metrics exporter that labels by key. Putting
   * the customer's live credential there undid the point of storing only its
   * HMAC in Postgres.
   */
  private buildScopeValue(
    dto: Pick<GatewayCheckDto, 'ip' | 'endpoint' | 'method' | 'userTier'>,
    rule: ResolvedRateLimitRule,
    apiKeyId: string,
  ) {
    switch (rule.scope) {
      case 'IP':
        return dto.ip;
      case 'API_KEY':
        return apiKeyId;
      case 'USER_TIER':
        return dto.userTier.toLowerCase();
      case 'ENDPOINT':
        return rule.endpointPattern ?? dto.endpoint;
      case 'GLOBAL':
      default:
        return 'global';
    }
  }

  /**
   * These four calls are launched with `void` on purpose: the caller is waiting
   * on a rate-limit decision and must not pay for a log write or a webhook POST.
   * Detaching them is the design; leaving them uncaught was not. Under Node's
   * default policy an unhandled rejection terminates the process, and both are
   * reachable from `POST /gateway/check` — see GAP-6 in docs/api-contract.md.
   *
   * The failure is logged and swallowed. The decision has already been returned
   * and is not affected either way.
   */
  private logDeferredFailure(operation: string, error: unknown): void {
    this.logger.error(
      `Deferred ${operation} failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
      error instanceof Error ? error.stack : undefined,
    );
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

    await Promise.all([
      this.prismaService.requestLog.create({
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
      }),
      this.prismaService.apiKey.update({
        where: { id: apiKeyId },
        data: { lastUsedAt: new Date() },
      }),
    ]);
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
