import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsSafeWebhookUrl } from '../validators/is-safe-webhook-url.validator';

export class UpdateWebhookEndpointDto {
  @ApiPropertyOptional({ example: 'Security Ops webhook' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: 'https://hooks.example.com/rlaas-alerts' })
  @IsOptional()
  @IsSafeWebhookUrl()
  url?: string;

  @ApiPropertyOptional({ example: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  blockedRequestsThreshold?: number;

  @ApiPropertyOptional({ example: 300 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(30)
  @Max(86400)
  windowSeconds?: number;

  @ApiPropertyOptional({ example: 300 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(30)
  @Max(86400)
  cooldownSeconds?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
