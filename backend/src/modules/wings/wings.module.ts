import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { Wing } from './entities/wing.entity';
import { WingsController } from './wings.controller';
import { WingsService } from './wings.service';

@Module({
  imports: [TypeOrmModule.forFeature([Wing, User])],
  controllers: [WingsController],
  providers: [WingsService],
})
export class WingsModule {}
