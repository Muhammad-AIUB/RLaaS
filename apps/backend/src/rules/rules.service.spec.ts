import {
  HttpMethod,
  RuleAlgorithm,
  RuleScope,
  UserTier,
} from '@prisma/client';
import { AlgorithmRegistryService } from '../algorithms/algorithm-registry.service';
import { AuditService } from '../audit/audit.service';
import { GatewayCheckDto } from '../gateway/dto/gateway-check.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { RulesService } from './rules.service';

describe('RulesService', () => {
  const findManyMock = jest.fn();
  const prismaService = {
    rateLimitRule: {
      findMany: findManyMock,
    },
  } as unknown as PrismaService;

  const projectsService = {} as ProjectsService;
  const algorithmRegistryService = {} as AlgorithmRegistryService;
  const auditService = {} as AuditService;
  const service = new RulesService(
    prismaService,
    projectsService,
    algorithmRegistryService,
    auditService,
  );

  beforeEach(() => {
    findManyMock.mockReset();
  });

  it('prefers IP rules over lower-precedence matches', async () => {
    findManyMock.mockResolvedValue([
      {
        id: 'global-rule',
        name: 'Global fallback',
        scope: RuleScope.GLOBAL,
        algorithm: RuleAlgorithm.FIXED_WINDOW,
        limit: 1000,
        windowSeconds: 60,
        targetValue: null,
        endpointPattern: null,
        method: null,
        userTier: null,
        priority: 99,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: 'ip-rule',
        name: 'Block abusive IP',
        scope: RuleScope.IP,
        algorithm: RuleAlgorithm.TOKEN_BUCKET,
        limit: 20,
        windowSeconds: 60,
        targetValue: '203.0.113.10',
        endpointPattern: null,
        method: HttpMethod.GET,
        userTier: null,
        priority: 5,
        createdAt: new Date('2026-01-01T00:00:01.000Z'),
      },
      {
        id: 'endpoint-rule',
        name: 'Catalog endpoint rule',
        scope: RuleScope.ENDPOINT,
        algorithm: RuleAlgorithm.SLIDING_WINDOW_LOG,
        limit: 40,
        windowSeconds: 60,
        targetValue: null,
        endpointPattern: '/api/products*',
        method: HttpMethod.GET,
        userTier: null,
        priority: 1,
        createdAt: new Date('2026-01-01T00:00:02.000Z'),
      },
    ]);

    const request: GatewayCheckDto = {
      apiKey: 'rlaas_live_test',
      ip: '203.0.113.10',
      endpoint: '/api/products/123',
      method: 'GET',
      userTier: 'free',
    };

    await expect(
      service.findMatchingRule({
        projectId: 'project-1',
        apiKeyId: 'api-key-1',
        apiKeyPrefix: 'rlaas_live_test',
        request,
      }),
    ).resolves.toMatchObject({
      id: 'ip-rule',
      scope: 'IP',
      algorithm: 'token_bucket',
      limit: 20,
    });
  });

  it('uses the first matching rule inside a precedence bucket by priority', async () => {
    findManyMock.mockResolvedValue([
      {
        id: 'tier-rule-2',
        name: 'Free tier relaxed',
        scope: RuleScope.USER_TIER,
        algorithm: RuleAlgorithm.FIXED_WINDOW,
        limit: 200,
        windowSeconds: 60,
        targetValue: null,
        endpointPattern: null,
        method: null,
        userTier: UserTier.FREE,
        priority: 20,
        createdAt: new Date('2026-01-01T00:00:02.000Z'),
      },
      {
        id: 'tier-rule-1',
        name: 'Free tier strict',
        scope: RuleScope.USER_TIER,
        algorithm: RuleAlgorithm.SLIDING_WINDOW_COUNTER,
        limit: 100,
        windowSeconds: 60,
        targetValue: null,
        endpointPattern: null,
        method: null,
        userTier: UserTier.FREE,
        priority: 10,
        createdAt: new Date('2026-01-01T00:00:01.000Z'),
      },
    ]);

    const request: GatewayCheckDto = {
      apiKey: 'rlaas_live_test',
      ip: '198.51.100.10',
      endpoint: '/api/products',
      method: 'GET',
      userTier: 'free',
    };

    await expect(
      service.findMatchingRule({
        projectId: 'project-1',
        apiKeyId: 'api-key-1',
        apiKeyPrefix: 'rlaas_live_test',
        request,
      }),
    ).resolves.toMatchObject({
      id: 'tier-rule-1',
      scope: 'USER_TIER',
      algorithm: 'sliding_window_counter',
      limit: 100,
    });
  });
});
