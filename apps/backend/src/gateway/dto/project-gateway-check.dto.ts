import { ApiProperty } from '@nestjs/swagger';
import { IsIP, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ProjectGatewayCheckDto {
  @ApiProperty({ example: '7d37d69e-a2ad-4f1e-9e0d-9b2d8c63bb75' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  apiKeyId!: string;

  @ApiProperty({ example: '203.0.113.10' })
  @IsIP()
  ip!: string;

  @ApiProperty({ example: '/api/orders' })
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
