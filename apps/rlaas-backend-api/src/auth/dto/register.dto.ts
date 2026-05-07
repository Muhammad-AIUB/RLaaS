import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserTier } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'founder@rlaas.dev' })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({ example: 'StrongPassword123!' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ example: 'RLaaS Founder' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName!: string;

  @ApiPropertyOptional({ enum: UserTier, default: UserTier.FREE })
  @IsOptional()
  @IsEnum(UserTier)
  tier?: UserTier;
}
