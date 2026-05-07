import { ProjectRole } from '@prisma/client';

export const PROJECT_OWNER_ONLY_ROLES = [ProjectRole.OWNER] as const;

export const PROJECT_WRITE_ROLES = [
  ProjectRole.OWNER,
  ProjectRole.ADMIN,
] as const;

export const PROJECT_READ_ROLES = [
  ProjectRole.OWNER,
  ProjectRole.ADMIN,
  ProjectRole.VIEWER,
] as const;
