import type { AuditLogRecord } from '@/lib/types';
import { apiFetch } from '../client';
import { endpoints } from '../endpoints';

export const auditLogsApi = {
  list: (projectId: string) =>
    apiFetch<AuditLogRecord[]>(endpoints.projects.auditLogs(projectId)),
};
