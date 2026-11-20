import { Module } from '@nestjs/common';
import { OfficeScopeService } from './office-scope.service';

/** v1.15 office report scope (SPEC.md §6.10). Only needs the DataSource. */
@Module({
  providers: [OfficeScopeService],
  exports: [OfficeScopeService],
})
export class OfficeScopeModule {}
