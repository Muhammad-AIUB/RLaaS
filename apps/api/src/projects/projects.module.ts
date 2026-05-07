import { forwardRef, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { UsersModule } from '../users/users.module';
import { ProjectAccessService } from './project-access.service';
import { ProjectMembersController } from './project-members.controller';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [forwardRef(() => AuditModule), UsersModule],
  controllers: [ProjectsController, ProjectMembersController],
  providers: [ProjectsService, ProjectAccessService],
  exports: [ProjectsService, ProjectAccessService],
})
export class ProjectsModule {}
