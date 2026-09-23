import { ApiPropertyOptional } from '@nestjs/swagger';
import { RuleAlgorithm, RuleScope } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class ListRulesQueryDto {
  @ApiPropertyOptional({ enum: RuleScope })
  @IsOptional()
  @IsEnum(RuleScope)
  scope?: RuleScope;

  @ApiPropertyOptional({ enum: RuleAlgorithm })
  @IsOptional()
  @IsEnum(RuleAlgorithm)
  algorithm?: RuleAlgorithm;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 50, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ description: 'Opaque cursor from a previous page' })
  @IsOptional()
  @IsString()
  cursor?: string;

  /**
   * 'priority' (default) sorts by priority asc then createdAt desc — matches
   * the gateway's evaluation order. 'recent' sorts by createdAt desc.
   */
  @ApiPropertyOptional({ enum: ['priority', 'recent'] })
  @IsOptional()
  @IsString()
  sort?: 'priority' | 'recent';
}
