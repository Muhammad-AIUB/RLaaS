import { ApiProperty } from '@nestjs/swagger';
import { IsIP, IsNotEmpty, IsString, MaxLength } from 'class-validator';

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

  @ApiProperty({ example: 'GET' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  method!: string;

  @ApiProperty({ example: 'free' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  userTier!: string;
}
