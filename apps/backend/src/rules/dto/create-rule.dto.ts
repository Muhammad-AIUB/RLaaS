import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HttpMethod, RuleAlgorithm, RuleScope, UserTier } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateRuleDto {
  @ApiProperty({ example: 'Free tier global protection' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: 'Default guardrail for free plans' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ example: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  priority!: number;

  @ApiProperty({ enum: RuleScope, example: RuleScope.GLOBAL })
  @IsEnum(RuleScope)
  scope!: RuleScope;

  @ApiPropertyOptional({ example: 'free' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  targetValue?: string;

  @ApiPropertyOptional({ example: '/api/products' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  endpointPattern?: string;

  @ApiPropertyOptional({ enum: HttpMethod, example: HttpMethod.GET })
  @IsOptional()
  @IsEnum(HttpMethod)
  method?: HttpMethod;

  @ApiPropertyOptional({ enum: UserTier, example: UserTier.FREE })
  @IsOptional()
  @IsEnum(UserTier)
  userTier?: UserTier;

  @ApiProperty({ enum: RuleAlgorithm, example: RuleAlgorithm.FIXED_WINDOW })
  @IsEnum(RuleAlgorithm)
  algorithm!: RuleAlgorithm;

  @ApiProperty({ example: 1000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  limit!: number;

  @ApiProperty({ example: 60 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(86400)
  windowSeconds!: number;

  @ApiPropertyOptional({ example: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  burstCapacity?: number;

  /**
   * Pausing a rule was impossible through the API.
   *
   * `isActive` is a column, `findMatchingRule` filters on it, the rules table
   * renders an Active/Paused badge, and the dashboard's Pause button sends
   * `PATCH { isActive }`. But UpdateRuleDto is PartialType(CreateRuleDto) and
   * this field was not on it, so with `forbidNonWhitelisted` the request came
   * back 400 "property isActive should not exist". The button had never
   * worked; the only way to stop a rule was to delete it.
   */
  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
