import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min, ValidateNested } from 'class-validator';
import { GatewayCheckDto } from '../../gateway/dto/gateway-check.dto';
import { CreateRuleDto } from './create-rule.dto';

export class SimulateRuleDto {
  @ApiProperty({ type: CreateRuleDto })
  @ValidateNested()
  @Type(() => CreateRuleDto)
  rule!: CreateRuleDto;

  @ApiProperty({ type: GatewayCheckDto })
  @ValidateNested()
  @Type(() => GatewayCheckDto)
  request!: GatewayCheckDto;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  requestCount?: number;
}
