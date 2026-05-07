import { RuleAlgorithm } from '@prisma/client';
import { RateLimitAlgorithm } from '../../algorithms/algorithm.enum';

export function mapRuleAlgorithm(
  value: RuleAlgorithm | RateLimitAlgorithm,
): RateLimitAlgorithm {
  switch (value) {
    case RuleAlgorithm.FIXED_WINDOW:
    case RateLimitAlgorithm.FIXED_WINDOW:
      return RateLimitAlgorithm.FIXED_WINDOW;
    case RuleAlgorithm.SLIDING_WINDOW_LOG:
    case RateLimitAlgorithm.SLIDING_WINDOW_LOG:
      return RateLimitAlgorithm.SLIDING_WINDOW_LOG;
    case RuleAlgorithm.SLIDING_WINDOW_COUNTER:
    case RateLimitAlgorithm.SLIDING_WINDOW_COUNTER:
      return RateLimitAlgorithm.SLIDING_WINDOW_COUNTER;
    case RuleAlgorithm.TOKEN_BUCKET:
    case RateLimitAlgorithm.TOKEN_BUCKET:
      return RateLimitAlgorithm.TOKEN_BUCKET;
    default:
      return RateLimitAlgorithm.FIXED_WINDOW;
  }
}
