import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ChangeRequestsController } from './change-requests.controller';
import { ChangeRequestsService } from './change-requests.service';
import { ChangeRequest } from './entities/change-request.entity';

@Module({
  // AuthModule: TokenService (an approved login-email change ends all sessions).
  imports: [AuthModule, TypeOrmModule.forFeature([ChangeRequest])],
  controllers: [ChangeRequestsController],
  providers: [ChangeRequestsService],
  exports: [ChangeRequestsService],
})
export class ChangeRequestsModule {}
