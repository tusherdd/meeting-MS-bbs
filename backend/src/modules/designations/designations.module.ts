import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { DesignationsController } from './designations.controller';
import { DesignationsService } from './designations.service';
import { Designation } from './entities/designation.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Designation, User])],
  controllers: [DesignationsController],
  providers: [DesignationsService],
})
export class DesignationsModule {}
