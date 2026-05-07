import { RateLimitAlgorithm } from '../algorithm.enum';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfter: number;
  algorithm: RateLimitAlgorithm;
}
