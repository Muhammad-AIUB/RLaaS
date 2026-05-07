export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  tier: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  environment: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: {
    apiKeys: number;
    rules: number;
  };
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  keyPrefix: string;
  status: string;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
  key?: string;
}

export interface RuleRecord {
  id: string;
  name: string;
  description?: string | null;
  priority: number;
  scope: string;
  targetValue?: string | null;
  endpointPattern?: string | null;
  method?: string | null;
  userTier?: string | null;
  algorithm: string;
  limit: number;
  windowSeconds: number;
  burstCapacity?: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

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
