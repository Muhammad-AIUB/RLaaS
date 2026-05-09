import type { CreateWebhookInput, WebhookEndpointRecord } from '@/lib/types';
import { apiFetch } from '../client';
import { endpoints } from '../endpoints';

export const webhooksApi = {
  list: (projectId: string) =>
    apiFetch<WebhookEndpointRecord[]>(endpoints.projects.webhooks(projectId)),
  create: (projectId: string, input: CreateWebhookInput) =>
    apiFetch<WebhookEndpointRecord>(endpoints.projects.webhooks(projectId), {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  remove: (projectId: string, webhookId: string) =>
    apiFetch<{ success: boolean }>(
      endpoints.projects.webhook(projectId, webhookId),
      { method: 'DELETE' },
    ),
};
