import { forwardRef, Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

@Module({
  imports: [forwardRef(() => ProjectsModule)],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
