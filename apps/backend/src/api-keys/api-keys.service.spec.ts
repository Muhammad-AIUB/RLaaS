import { ApiKeyStatus, ProjectRole } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { ApiKeysService } from './api-keys.service';

describe('ApiKeysService', () => {
  const assertProjectAccessMock = jest.fn();
  const createMock = jest.fn();
  const findFirstMock = jest.fn();
  const updateMock = jest.fn();
  const logMock = jest.fn();

  const prismaService = {
    apiKey: {
      create: createMock,
      findFirst: findFirstMock,
      update: updateMock,
    },
  } as unknown as PrismaService;

  const projectsService = {
    assertProjectAccess: assertProjectAccessMock,
  } as unknown as ProjectsService;

  const auditService = {
    log: logMock,
  } as unknown as AuditService;

  const service = new ApiKeysService(
    prismaService,
    projectsService,
    auditService,
  );

  beforeEach(() => {
    assertProjectAccessMock.mockReset();
    createMock.mockReset();
    findFirstMock.mockReset();
    updateMock.mockReset();
    logMock.mockReset();
    assertProjectAccessMock.mockResolvedValue({});
    logMock.mockResolvedValue(undefined);
  });

  it('creates API keys as ACTIVE', async () => {
    const createdAt = new Date('2026-05-10T00:00:00.000Z');
    const apiKey = {
      id: 'api-key-1',
      projectId: 'project-1',
      name: 'Test Production Key',
      keyPrefix: 'rlaas_live_test',
      hashedKey: 'hashed-key',
      hashVersion: 'hmac-sha256-v1',
      status: ApiKeyStatus.ACTIVE,
      lastUsedAt: null,
      expiresAt: null,
      createdAt,
      updatedAt: createdAt,
    };
    createMock.mockResolvedValue(apiKey);

    const result = await service.create('user-1', 'project-1', {
      name: 'Test Production Key',
    });

    expect(assertProjectAccessMock).toHaveBeenCalledWith('user-1', 'project-1', [
      ProjectRole.OWNER,
      ProjectRole.ADMIN,
    ]);
    expect(createMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: 'project-1',
        name: 'Test Production Key',
        hashVersion: 'hmac-sha256-v1',
        status: ApiKeyStatus.ACTIVE,
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: 'api-key-1',
        name: 'Test Production Key',
        status: ApiKeyStatus.ACTIVE,
        key: expect.stringMatching(/^rlaas_live_/),
      }),
    );
  });

  it('revokes API keys as REVOKED', async () => {
    const updatedAt = new Date('2026-05-10T00:00:00.000Z');
    findFirstMock.mockResolvedValue({
      id: 'api-key-1',
      projectId: 'project-1',
    });
    updateMock.mockResolvedValue({
      id: 'api-key-1',
      projectId: 'project-1',
      name: 'Test Production Key',
      keyPrefix: 'rlaas_live_test',
      status: ApiKeyStatus.REVOKED,
      lastUsedAt: null,
      expiresAt: null,
      createdAt: updatedAt,
      updatedAt,
    });

    const result = await service.revoke(
      'user-1',
      'project-1',
      'api-key-1',
    );

    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'api-key-1' },
      data: {
        status: ApiKeyStatus.REVOKED,
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: 'api-key-1',
        status: ApiKeyStatus.REVOKED,
      }),
    );
  });
});
