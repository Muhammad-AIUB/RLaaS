import { Injectable } from '@nestjs/common';
import { RateLimitAlgorithm } from './algorithm.enum';
import { FixedWindowAlgorithmService } from './fixed-window/fixed-window-algorithm.service';
import { RateLimitAlgorithmHandler } from './interfaces/rate-limit-algorithm.interface';
import { SlidingWindowCounterAlgorithmService } from './sliding-window-counter/sliding-window-counter-algorithm.service';
import { SlidingWindowLogAlgorithmService } from './sliding-window-log/sliding-window-log-algorithm.service';
import { TokenBucketAlgorithmService } from './token-bucket/token-bucket-algorithm.service';

@Injectable()
export class AlgorithmRegistryService {
  private readonly algorithms: Map<RateLimitAlgorithm, RateLimitAlgorithmHandler>;

  constructor(
    fixedWindow: FixedWindowAlgorithmService,
    slidingWindowLog: SlidingWindowLogAlgorithmService,
    slidingWindowCounter: SlidingWindowCounterAlgorithmService,
    tokenBucket: TokenBucketAlgorithmService,
  ) {
    const handlers: Array<[RateLimitAlgorithm, RateLimitAlgorithmHandler]> = [
      [fixedWindow.algorithm, fixedWindow],
      [slidingWindowLog.algorithm, slidingWindowLog],
      [slidingWindowCounter.algorithm, slidingWindowCounter],
      [tokenBucket.algorithm, tokenBucket],
    ];

    this.algorithms = new Map(handlers);
  }

  get(algorithm: RateLimitAlgorithm): RateLimitAlgorithmHandler {
    const handler = this.algorithms.get(algorithm);

    if (!handler) {
      throw new Error(`Unsupported rate limit algorithm: ${algorithm}`);
    }

    return handler;
  }
}
