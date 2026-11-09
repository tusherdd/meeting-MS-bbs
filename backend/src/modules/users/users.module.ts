import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { UserAdditionalCharge } from './entities/user-additional-charge.entity';
import { User } from './entities/user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  // AuthModule provides TokenService (deactivation / reset revoke sessions).
  imports: [AuthModule, TypeOrmModule.forFeature([User, UserAdditionalCharge])],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
