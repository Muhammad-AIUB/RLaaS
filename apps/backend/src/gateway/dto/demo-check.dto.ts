import { IsEnum, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { RateLimitAlgorithm } from '../../algorithms/algorithm.enum';

export class DemoCheckDto {
  @IsEnum(RateLimitAlgorithm)
  algorithm: RateLimitAlgorithm;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'identifier must contain only letters, numbers, underscores, or hyphens',
  })
  identifier: string;
}
