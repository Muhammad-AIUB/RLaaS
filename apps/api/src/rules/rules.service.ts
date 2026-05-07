import { HttpMethod, RuleScope, UserTier } from '@prisma/client';
import { Injectable, NotFoundException } from '@nestjs/common';
import { GatewayCheckDto } from '../gateway/dto/gateway-check.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { ResolvedRateLimitRule } from '../rate-limiter/interfaces/resolved-rate-limit-rule.interface';
import { mapRuleAlgorithm } from '../rate-limiter/utils/rule-algorithm.util';
import { CreateRuleDto } from './dto/create-rule.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';

@Injectable()
export class RulesService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  async create(ownerId: string, projectId: string, dto: CreateRuleDto) {
    await this.projectsService.getById(ownerId, projectId);

    return this.prismaService.rateLimitRule.create({
      data: {
        projectId,
        ...dto,
      },
    });
  }

  async listByProject(ownerId: string, projectId: string) {
    await this.projectsService.getById(ownerId, projectId);

    return this.prismaService.rateLimitRule.findMany({
      where: { projectId },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async update(
    ownerId: string,
    projectId: string,
    ruleId: string,
    dto: UpdateRuleDto,
  ) {
    await this.projectsService.getById(ownerId, projectId);
    await this.getOwnedRule(projectId, ruleId);

    return this.prismaService.rateLimitRule.update({
      where: { id: ruleId },
      data: dto,
    });
  }

  async delete(ownerId: string, projectId: string, ruleId: string) {
    await this.projectsService.getById(ownerId, projectId);
    await this.getOwnedRule(projectId, ruleId);

    await this.prismaService.rateLimitRule.delete({
      where: { id: ruleId },
    });

    return {
      success: true,
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
