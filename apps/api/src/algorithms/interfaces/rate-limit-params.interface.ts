import { RateLimitAlgorithm } from '../algorithm.enum';

export interface RateLimitParams {
  key: string;
  limit: number;
  windowSeconds: number;
  algorithm: RateLimitAlgorithm;
  nowMs?: number;
}
