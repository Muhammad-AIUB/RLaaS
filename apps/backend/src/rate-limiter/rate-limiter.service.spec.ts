import {
  ApiKeyStatus,
  RequestDecision,
  RuleAlgorithm,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { AlgorithmRegistryService } from '../algorithms/algorithm-registry.service';
import { RateLimitAlgorithm } from '../algorithms/algorithm.enum';
import { GatewayCheckDto } from '../gateway/dto/gateway-check.dto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RulesService } from '../rules/rules.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { RateLimiterService } from './rate-limiter.service';

describe('RateLimiterService', () => {
  const consumeMock = jest.fn();
  const createLogMock = jest.fn();
  const updateApiKeyMock = jest.fn();
  const findApiKeyFirstMock = jest.fn();
  const findByRawKeyMock = jest.fn();
  const findMatchingRuleMock = jest.fn();
  const redisGetMock = jest.fn();
  const redisSetMock = jest.fn();
  const notifyHighBlockedActivityMock = jest.fn();

  const configService = {
    get: jest.fn((key: string, defaultValue: unknown) => defaultValue),
  } as unknown as ConfigService;

  const algorithmRegistryService = {
    get: jest.fn(() => ({
      consume: consumeMock,
    })),
  } as unknown as AlgorithmRegistryService;

  const apiKeysService = {
    findByRawKey: findByRawKeyMock,
  } as unknown as ApiKeysService;

  const rulesService = {
    findMatchingRule: findMatchingRuleMock,
  } as unknown as RulesService;

  const prismaService = {
    requestLog: {
      create: createLogMock,
    },
    apiKey: {
      findFirst: findApiKeyFirstMock,
      update: updateApiKeyMock,
    },
  } as unknown as PrismaService;

  const redisService = {
    getClient: jest.fn(() => ({
      get: redisGetMock,
      set: redisSetMock,
    })),
  } as unknown as RedisService;

  const webhooksService = {
    notifyHighBlockedActivity: notifyHighBlockedActivityMock,
  } as unknown as WebhooksService;

  const service = new RateLimiterService(
    configService,
    algorithmRegistryService,
    apiKeysService,
    rulesService,
    prismaService,
    redisService,
    webhooksService,
  );

  beforeEach(() => {
    consumeMock.mockReset();
    createLogMock.mockReset();
    updateApiKeyMock.mockReset();
    findApiKeyFirstMock.mockReset();
    findByRawKeyMock.mockReset();
    findMatchingRuleMock.mockReset();
    redisGetMock.mockReset();
    redisSetMock.mockReset();
    notifyHighBlockedActivityMock.mockReset();
    notifyHighBlockedActivityMock.mockResolvedValue(undefined);
  });

  it('returns API_KEY_INVALID when the key is unknown', async () => {
    findByRawKeyMock.mockResolvedValue(null);

    const request: GatewayCheckDto = {
      apiKey: 'missing',
      ip: '203.0.113.10',
      endpoint: '/api/products',
      method: 'GET',
      userTier: 'free',
    };

    await expect(service.checkRequest(request)).resolves.toEqual({
      allowed: false,
      reason: 'API_KEY_INVALID',
      limit: 0,
      remaining: 0,
      retryAfter: 0,
      algorithm: RateLimitAlgorithm.FIXED_WINDOW,
    });
  });

  it('evaluates the matched persisted rule and stores a request log', async () => {
    findByRawKeyMock.mockResolvedValue({
      id: 'api-key-1',
      projectId: 'project-1',
      keyPrefix: 'rlaas_live_abc',
      status: ApiKeyStatus.ACTIVE,
      expiresAt: null,
    });
    findMatchingRuleMock.mockResolvedValue({
      id: 'rule-1',
      name: 'IP protection',
      scope: 'IP',
      algorithm: RateLimitAlgorithm.SLIDING_WINDOW_LOG,
      limit: 50,
      windowSeconds: 60,
      targetValue: '203.0.113.10',
      endpointPattern: null,
    });
    consumeMock.mockResolvedValue({
      allowed: false,
      limit: 50,
      remaining: 0,
      retryAfter: 12,
      algorithm: RateLimitAlgorithm.SLIDING_WINDOW_LOG,
    });
    createLogMock.mockResolvedValue({});
    updateApiKeyMock.mockResolvedValue({});

    const request: GatewayCheckDto = {
      apiKey: 'rlaas_live_secret',
      ip: '203.0.113.10',
      endpoint: '/api/products',
      method: 'GET',
      userTier: 'free',
    };

    await expect(service.checkRequest(request)).resolves.toMatchObject({
      allowed: false,
      reason: 'RATE_LIMIT_EXCEEDED',
      limit: 50,
      remaining: 0,
      retryAfter: 12,
      algorithm: RateLimitAlgorithm.SLIDING_WINDOW_LOG,
      ruleId: 'rule-1',
      ruleName: 'IP protection',
      scope: 'IP',
    });

    expect(algorithmRegistryService.get).toHaveBeenCalledWith(
      RateLimitAlgorithm.SLIDING_WINDOW_LOG,
    );
    expect(createLogMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: 'project-1',
        apiKeyId: 'api-key-1',
        ruleId: 'rule-1',
        decision: RequestDecision.BLOCKED,
        algorithm: RuleAlgorithm.SLIDING_WINDOW_LOG,
      }),
    });
    expect(updateApiKeyMock).toHaveBeenCalledWith({
      where: { id: 'api-key-1' },
      data: {
        lastUsedAt: expect.any(Date),
      },
    });
  });

  it('evaluates a project tester request by API key id', async () => {
    findApiKeyFirstMock.mockResolvedValue({
      id: 'api-key-1',
      projectId: 'project-1',
      keyPrefix: 'rlaas_live_abc',
      status: ApiKeyStatus.ACTIVE,
      expiresAt: null,
    });
    findMatchingRuleMock.mockResolvedValue({
      id: 'rule-1',
      name: 'Tester rule',
      scope: 'GLOBAL',
      algorithm: RateLimitAlgorithm.FIXED_WINDOW,
      limit: 2,
      windowSeconds: 60,
    });
    consumeMock.mockResolvedValue({
      allowed: true,
      limit: 2,
      remaining: 1,
      retryAfter: 0,
      algorithm: RateLimitAlgorithm.FIXED_WINDOW,
    });
    createLogMock.mockResolvedValue({});
    updateApiKeyMock.mockResolvedValue({});

    await expect(
      service.checkProjectRequest('project-1', {
        apiKeyId: 'api-key-1',
        ip: '203.0.113.10',
        endpoint: '/api/orders',
        method: 'GET',
        userTier: 'free',
      }),
    ).resolves.toMatchObject({
      allowed: true,
      limit: 2,
      remaining: 1,
      ruleId: 'rule-1',
      ruleName: 'Tester rule',
    });

    expect(findApiKeyFirstMock).toHaveBeenCalledWith({
      where: {
        id: 'api-key-1',
        projectId: 'project-1',
      },
      select: {
        id: true,
        projectId: true,
        keyPrefix: true,
        status: true,
        expiresAt: true,
      },
    });
    expect(findMatchingRuleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKeyId: 'api-key-1',
        apiKeyPrefix: 'rlaas_live_abc',
        projectId: 'project-1',
      }),
    );
  });
});
