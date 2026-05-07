import { RateLimitAlgorithm } from '../../algorithms/algorithm.enum';

export interface ResolvedRateLimitRule {
  id?: string;
  name: string;
  scope: 'IP' | 'API_KEY' | 'USER_TIER' | 'ENDPOINT' | 'GLOBAL';
  algorithm: RateLimitAlgorithm;
  limit: number;
  windowSeconds: number;
  targetValue?: string | null;
  endpointPattern?: string | null;
}
