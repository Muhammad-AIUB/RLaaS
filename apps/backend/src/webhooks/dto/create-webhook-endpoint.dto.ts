import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WebhookEventType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateWebhookEndpointDto {
  @ApiProperty({ example: 'Security Ops webhook' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'https://hooks.example.com/rlaas-alerts' })
  @IsUrl({ require_tld: false })
  url!: string;

  @ApiPropertyOptional({
    enum: WebhookEventType,
    default: WebhookEventType.HIGH_BLOCKED_ACTIVITY,
  })
  @IsOptional()
  @IsEnum(WebhookEventType)
  eventType?: WebhookEventType;

  @ApiPropertyOptional({ example: 'super-secret-signing-key' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  signingSecret?: string;

  @ApiPropertyOptional({ example: 25, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  blockedRequestsThreshold?: number;

  @ApiPropertyOptional({ example: 300, default: 300 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(30)
  @Max(86400)
  windowSeconds?: number;

  @ApiPropertyOptional({ example: 300, default: 300 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(30)
  @Max(86400)
  cooldownSeconds?: number;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
