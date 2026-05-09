import { RateLimitAlgorithm } from '../algorithm.enum';
import { RateLimitParams } from './rate-limit-params.interface';
import { RateLimitResult } from './rate-limit-result.interface';

export interface RateLimitAlgorithmHandler {
  readonly algorithm: RateLimitAlgorithm;
  consume(params: RateLimitParams): Promise<RateLimitResult>;
}
