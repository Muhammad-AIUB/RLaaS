export interface WebhookEndpointRecord {
  id: string;
  name: string;
  url: string;
  eventType: string;
  blockedRequestsThreshold: number;
  windowSeconds: number;
  cooldownSeconds: number;
  isActive: boolean;
  lastTriggeredAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWebhookInput {
  name: string;
  url: string;
  blockedRequestsThreshold: number;
  windowSeconds: number;
  cooldownSeconds: number;
}

export interface UpdateWebhookInput {
  name?: string;
  url?: string;
  blockedRequestsThreshold?: number;
  windowSeconds?: number;
  cooldownSeconds?: number;
  isActive?: boolean;
}
