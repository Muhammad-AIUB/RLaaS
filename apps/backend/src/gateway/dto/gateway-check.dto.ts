import { ApiProperty } from '@nestjs/swagger';
import { HttpMethod } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIP,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class GatewayCheckDto {
  @ApiProperty({ example: 'project_api_key_live_123' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  apiKey!: string;

  @ApiProperty({ example: '203.0.113.10' })
  @IsIP()
  ip!: string;

  @ApiProperty({ example: '/api/products' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  endpoint!: string;

  /**
   * Constrained to the methods the request log can actually store.
   *
   * This used to be a free string. The gateway happily rate limited a request
   * with `method: "BREW"`, then the deferred `requestLog.create` threw
   * PrismaClientValidationError ("Invalid value for argument `method`") and
   * the deferred error handler swallowed it. The decision was served, but the
   * request left no row in analytics, never updated `lastUsedAt`, and never
   * counted toward the blocked totals the webhook alerts are built on — so
   * sending a nonstandard method made traffic invisible to the platform.
   *
   * Rejecting at the boundary keeps the contract honest: the API no longer
   * accepts something it cannot record.
   */
  @ApiProperty({ enum: HttpMethod, example: HttpMethod.GET })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsEnum(HttpMethod, {
    message: `method must be one of: ${Object.values(HttpMethod).join(', ')}`,
  })
  method!: HttpMethod;

  @ApiProperty({ example: 'free' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  userTier!: string;

  @ApiProperty({ example: 'idem_01j2h4w6x8y0z', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  idempotencyKey?: string;
}
