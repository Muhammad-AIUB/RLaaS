import { createHash, randomUUID } from 'crypto';
import { HttpMethod, Prisma, ProjectRole, RuleScope, UserTier } from '@prisma/client';
import { Injectable, NotFoundException } from '@nestjs/common';
import { AlgorithmRegistryService } from '../algorithms/algorithm-registry.service';
import { RateLimitResult } from '../algorithms/interfaces/rate-limit-result.interface';
import { AuditService } from '../audit/audit.service';
import { RequestMetadata } from '../common/interfaces/request-metadata.interface';
import { GatewayCheckDto } from '../gateway/dto/gateway-check.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { ResolvedRateLimitRule } from '../rate-limiter/interfaces/resolved-rate-limit-rule.interface';
import { mapRuleAlgorithm } from '../rate-limiter/utils/rule-algorithm.util';
import { CreateRuleDto } from './dto/create-rule.dto';
import { SimulateRuleDto } from './dto/simulate-rule.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';

@Injectable()
export class RulesService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly algorithmRegistryService: AlgorithmRegistryService,
    private readonly auditService: AuditService,
  ) {}

  async create(
    userId: string,
    projectId: string,
    dto: CreateRuleDto,
    request?: RequestMetadata,
  ) {
    await this.projectsService.assertProjectAccess(userId, projectId, [
      ProjectRole.OWNER,
      ProjectRole.ADMIN,
    ]);

    const rule = await this.prismaService.rateLimitRule.create({
      data: {
        projectId,
        ...dto,
      },
    });

    void this.auditService.log({
      action: 'rule.created',
      actorId: userId,
      projectId,
      resourceType: 'rate_limit_rule',
      resourceId: rule.id,
      metadata: {
        scope: rule.scope,
        algorithm: rule.algorithm,
        limit: rule.limit,
        windowSeconds: rule.windowSeconds,
      },
      request,
    });

    return rule;
  }

  async listByProject(userId: string, projectId: string) {
    await this.projectsService.assertProjectAccess(userId, projectId, [
      ProjectRole.OWNER,
      ProjectRole.ADMIN,
      ProjectRole.VIEWER,
    ]);

    return this.prismaService.rateLimitRule.findMany({
      where: { projectId },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async update(
    userId: string,
    projectId: string,
    ruleId: string,
    dto: UpdateRuleDto,
    request?: RequestMetadata,
  ) {
    await this.projectsService.assertProjectAccess(userId, projectId, [
      ProjectRole.OWNER,
      ProjectRole.ADMIN,
    ]);
    await this.getOwnedRule(projectId, ruleId);

    const rule = await this.prismaService.rateLimitRule.update({
      where: { id: ruleId },
      data: dto,
    });

    void this.auditService.log({
      action: 'rule.updated',
      actorId: userId,
      projectId,
      resourceType: 'rate_limit_rule',
      resourceId: ruleId,
      metadata: dto as unknown as Prisma.InputJsonValue,
      request,
    });

    return rule;
  }

  async delete(
    userId: string,
    projectId: string,
    ruleId: string,
    request?: RequestMetadata,
  ) {
    await this.projectsService.assertProjectAccess(userId, projectId, [
      ProjectRole.OWNER,
      ProjectRole.ADMIN,
    ]);
    await this.getOwnedRule(projectId, ruleId);

    await this.prismaService.rateLimitRule.delete({
      where: { id: ruleId },
    });

    void this.auditService.log({
      action: 'rule.deleted',
      actorId: userId,
      projectId,
      resourceType: 'rate_limit_rule',
      resourceId: ruleId,
      request,
    });

    return {
      success: true,
    };
  }

  async simulate(
    userId: string,
    projectId: string,
    dto: SimulateRuleDto,
    request?: RequestMetadata,
  ) {
    await this.projectsService.assertProjectAccess(userId, projectId, [
      ProjectRole.OWNER,
      ProjectRole.ADMIN,
    ]);

    const simulatedRule: ResolvedRateLimitRule = {
      name: dto.rule.name,
      scope: dto.rule.scope,
      algorithm: mapRuleAlgorithm(dto.rule.algorithm),
      limit: dto.rule.limit,
      windowSeconds: dto.rule.windowSeconds,
      targetValue: dto.rule.targetValue,
      endpointPattern: dto.rule.endpointPattern,
    };

    const method = dto.request.method.toUpperCase() as HttpMethod;
    const normalizedTier = dto.request.userTier.toUpperCase() as UserTier;
    const matches = this.ruleMatchesRequest(
      {
        ...dto.rule,
        method: dto.rule.method ?? null,
        userTier: dto.rule.userTier ?? null,
      },
      dto.request,
      method,
      normalizedTier,
    );

    if (!matches) {
      return {
        matches: false,
        reason: 'RULE_DOES_NOT_MATCH_REQUEST',
      };
    }

    const simulationKey = this.buildSimulationKey(projectId, dto);
    const iterations = dto.requestCount ?? 1;
    let lastResult: RateLimitResult | null = null;

    for (let index = 0; index < iterations; index += 1) {
      lastResult = await this.algorithmRegistryService.get(simulatedRule.algorithm).consume({
        key: simulationKey,
        limit: simulatedRule.limit,
        windowSeconds: simulatedRule.windowSeconds,
        algorithm: simulatedRule.algorithm,
      });
    }

    void this.auditService.log({
      action: 'rule.simulated',
      actorId: userId,
      projectId,
      resourceType: 'rate_limit_rule_simulation',
      metadata: {
        iterations,
        scope: simulatedRule.scope,
        algorithm: simulatedRule.algorithm,
        endpoint: dto.request.endpoint,
      },
      request,
    });

    return {
      matches: true,
      simulationKey,
      simulatedRequests: iterations,
      result: lastResult,
      rule: simulatedRule,
    };
  }

  async findMatchingRule(params: {
    projectId: string;
    apiKeyId: string;
    apiKeyPrefix: string;
    request: GatewayCheckDto;
  }): Promise<ResolvedRateLimitRule | null> {
    const rules = await this.prismaService.rateLimitRule.findMany({
      where: {
        projectId: params.projectId,
        isActive: true,
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });

    const scopedRules = this.groupRulesByScope(rules);
    const method = params.request.method.toUpperCase() as HttpMethod;
    const normalizedTier = params.request.userTier.toUpperCase() as UserTier;

    const candidates = [
      ...scopedRules.ip.filter(
        (rule) =>
          this.matchesMethod(rule.method, method) &&
          rule.targetValue === params.request.ip,
      ),
      ...scopedRules.apiKey.filter(
        (rule) =>
          this.matchesMethod(rule.method, method) &&
          [params.apiKeyId, params.apiKeyPrefix, params.request.apiKey].includes(
            rule.targetValue ?? '',
          ),
      ),
      ...scopedRules.userTier.filter(
        (rule) =>
          this.matchesMethod(rule.method, method) &&
          (rule.userTier === normalizedTier ||
            rule.targetValue?.toUpperCase() === normalizedTier),
      ),
      ...scopedRules.endpoint.filter(
        (rule) =>
          this.matchesMethod(rule.method, method) &&
          this.matchesEndpointPattern(
            rule.endpointPattern ?? rule.targetValue ?? '',
            params.request.endpoint,
          ),
      ),
      ...scopedRules.global.filter((rule) => this.matchesMethod(rule.method, method)),
    ];

    const selected = candidates[0];

    if (!selected) {
      return null;
    }

    return {
      id: selected.id,
      name: selected.name,
      scope: selected.scope,
      algorithm: mapRuleAlgorithm(selected.algorithm),
      limit: selected.limit,
      windowSeconds: selected.windowSeconds,
      targetValue: selected.targetValue,
      endpointPattern: selected.endpointPattern,
    };
  }

  private groupRulesByScope(
    rules: Awaited<ReturnType<PrismaService['rateLimitRule']['findMany']>>,
  ) {
    const sortByPriority = (
      left: { priority: number; createdAt: Date },
      right: { priority: number; createdAt: Date },
    ) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }

      return left.createdAt.getTime() - right.createdAt.getTime();
    };

    return {
      ip: rules.filter((rule) => rule.scope === RuleScope.IP).sort(sortByPriority),
      apiKey: rules
        .filter((rule) => rule.scope === RuleScope.API_KEY)
        .sort(sortByPriority),
      userTier: rules
        .filter((rule) => rule.scope === RuleScope.USER_TIER)
        .sort(sortByPriority),
      endpoint: rules
        .filter((rule) => rule.scope === RuleScope.ENDPOINT)
        .sort(sortByPriority),
      global: rules
        .filter((rule) => rule.scope === RuleScope.GLOBAL)
        .sort(sortByPriority),
    };
  }

  private matchesMethod(ruleMethod: HttpMethod | null, requestMethod: HttpMethod) {
    return !ruleMethod || ruleMethod === requestMethod;
  }

  private ruleMatchesRequest(
    rule: {
      scope: RuleScope;
      method: HttpMethod | null;
      targetValue?: string | null;
      endpointPattern?: string | null;
      userTier?: UserTier | null;
    },
    request: GatewayCheckDto,
    method: HttpMethod,
    normalizedTier: UserTier,
  ) {
    if (!this.matchesMethod(rule.method, method)) {
      return false;
    }

    switch (rule.scope) {
      case RuleScope.IP:
        return rule.targetValue === request.ip;
      case RuleScope.API_KEY:
        return request.apiKey === (rule.targetValue ?? '');
      case RuleScope.USER_TIER:
        return (
          rule.userTier === normalizedTier ||
          rule.targetValue?.toUpperCase() === normalizedTier
        );
      case RuleScope.ENDPOINT:
        return this.matchesEndpointPattern(
          rule.endpointPattern ?? rule.targetValue ?? '',
          request.endpoint,
        );
      case RuleScope.GLOBAL:
      default:
        return true;
    }
  }

  private buildSimulationKey(projectId: string, dto: SimulateRuleDto) {
    const fingerprint = createHash('sha256')
      .update(JSON.stringify(dto))
      .digest('hex')
      .slice(0, 16);

    return ['rlaas', 'simulation', projectId, randomUUID(), fingerprint].join(':');
  }

  private matchesEndpointPattern(pattern: string, endpoint: string) {
    if (!pattern) {
      return false;
    }

    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^${escaped.replace(/\*/g, '.*')}$`);

    return regex.test(endpoint);
  }

  private async getOwnedRule(projectId: string, ruleId: string) {
    const rule = await this.prismaService.rateLimitRule.findFirst({
      where: {
        id: ruleId,
        projectId,
      },
    });

    if (!rule) {
      throw new NotFoundException('Rule not found');
    }

    return rule;
  }
}
