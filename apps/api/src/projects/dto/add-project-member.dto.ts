import { ApiProperty } from '@nestjs/swagger';
import { ProjectRole } from '@prisma/client';
import { IsEmail, IsEnum } from 'class-validator';

export class AddProjectMemberDto {
  @ApiProperty({ example: 'admin@company.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: ProjectRole, example: ProjectRole.ADMIN })
  @IsEnum(ProjectRole)
  role!: ProjectRole;
}
