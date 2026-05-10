export interface GatewayTesterInput {
  apiKeyId: string;
  ip: string;
  endpoint: string;
  method: string;
  userTier: string;
}

export interface GatewayTesterResult {
  allowed: boolean;
  reason?: string;
  limit: number;
  remaining: number;
  retryAfter: number;
  algorithm: string;
  ruleId?: string;
  ruleName?: string;
  scope?: string;
  idempotencyStatus?: string;
}

export interface GatewayTesterTimelineItem extends GatewayTesterResult {
  index: number;
  latencyMs: number;
  timestamp: string;
}
