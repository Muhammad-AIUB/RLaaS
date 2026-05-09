export interface AnalyticsOverview {
  totalRequests: number;
  allowedRequests: number;
  blockedRequests: number;
  blockRate: number;
}

export interface TopIpRecord {
  ip: string;
  requests: number;
}

export interface TopEndpointRecord {
  endpoint: string;
  method: string;
  requests: number;
}

export interface AlgorithmPerformanceRecord {
  algorithm: string;
  requests: number;
  averageRetryAfter: number;
  averageResponseTimeMs: number;
}

export interface RequestLogRecord {
  id: string;
  ipAddress: string;
  endpoint: string;
  method: string;
  userTier?: string | null;
  decision: string;
  reason?: string | null;
  algorithm: string;
  limit: number;
  remaining: number;
  retryAfter: number;
  responseTimeMs?: number | null;
  createdAt: string;
  apiKey?: {
    id: string;
    name: string;
    keyPrefix: string;
    status: string;
  } | null;
  rule?: {
    id: string;
    name: string;
    scope: string;
    priority: number;
  } | null;
}

export type SnapshotWindow = 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface SnapshotRecord {
  id: string;
  window: string;
  periodStart: string;
  periodEnd: string;
  totalRequests: number;
  allowedRequests: number;
  blockedRequests: number;
  blockRate: string | number;
  topOffendingIps?: TopIpRecord[] | null;
  mostUsedEndpoints?: TopEndpointRecord[] | null;
  algorithmPerformanceComparison?: AlgorithmPerformanceRecord[] | null;
}

export interface CreateSnapshotInput {
  window: SnapshotWindow | string;
}
