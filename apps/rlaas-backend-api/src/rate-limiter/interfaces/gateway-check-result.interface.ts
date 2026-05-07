import { RateLimitAlgorithm } from '../../algorithms/algorithm.enum';

export interface GatewayCheckResult {
  allowed: boolean;
  reason?: 'RATE_LIMIT_EXCEEDED' | 'API_KEY_INVALID' | 'API_KEY_REVOKED';
  limit: number;
  remaining: number;
  retryAfter: number;
  algorithm: RateLimitAlgorithm;
  ruleId?: string;
  ruleName?: string;
  scope?: string;
}
