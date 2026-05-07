import { Module } from '@nestjs/common';
import { AlgorithmRegistryService } from './algorithm-registry.service';
import { FixedWindowAlgorithmService } from './fixed-window/fixed-window-algorithm.service';
import { SlidingWindowCounterAlgorithmService } from './sliding-window-counter/sliding-window-counter-algorithm.service';
import { SlidingWindowLogAlgorithmService } from './sliding-window-log/sliding-window-log-algorithm.service';
import { TokenBucketAlgorithmService } from './token-bucket/token-bucket-algorithm.service';

@Module({
  providers: [
    FixedWindowAlgorithmService,
    SlidingWindowLogAlgorithmService,
    SlidingWindowCounterAlgorithmService,
    TokenBucketAlgorithmService,
    AlgorithmRegistryService,
  ],
  exports: [AlgorithmRegistryService],
})
export class AlgorithmsModule {}
