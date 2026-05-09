import type { ApiKeyRecord, CreateApiKeyInput } from '@/lib/types';
import { apiFetch } from '../client';
import { endpoints } from '../endpoints';

export const apiKeysApi = {
  list: (projectId: string) =>
    apiFetch<ApiKeyRecord[]>(endpoints.projects.apiKeys(projectId)),
  create: (projectId: string, input: CreateApiKeyInput) =>
    apiFetch<ApiKeyRecord>(endpoints.projects.apiKeys(projectId), {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  revoke: (projectId: string, keyId: string) =>
    apiFetch<ApiKeyRecord>(endpoints.projects.apiKeyRevoke(projectId, keyId), {
      method: 'PATCH',
    }),
};
