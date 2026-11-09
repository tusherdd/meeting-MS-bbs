import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditQueryService } from './audit-query.service';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditLog } from './entities/audit-log.entity';

/** Global: every feature module may write audit entries. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  controllers: [AuditController],
  providers: [AuditService, AuditQueryService],
  exports: [AuditService],
})
export class AuditModule {}
