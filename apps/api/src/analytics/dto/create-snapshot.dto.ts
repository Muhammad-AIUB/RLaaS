import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SnapshotWindow } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional } from 'class-validator';

export class CreateSnapshotDto {
  @ApiProperty({ enum: SnapshotWindow, example: SnapshotWindow.DAILY })
  @IsEnum(SnapshotWindow)
  window!: SnapshotWindow;

  @ApiPropertyOptional({ example: '2026-05-01T00:00:00.000Z' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({ example: '2026-05-07T23:59:59.999Z' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}
