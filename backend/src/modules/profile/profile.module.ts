import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { memoryStorage } from 'multer';
import { EnvVars } from '../../config/env.validation';
import { ChangeRequestsModule } from '../change-requests/change-requests.module';
import { User } from '../users/entities/user.entity';
import { AvatarStorageService } from './avatar-storage.service';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    ChangeRequestsModule,
    // Uploads stay in memory (max MAX_UPLOAD_MB, one file): nothing unchecked touches disk.
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvVars, true>) => ({
        storage: memoryStorage(),
        limits: {
          fileSize: config.get('MAX_UPLOAD_MB', { infer: true }) * 1024 * 1024,
          files: 1,
          fields: 5,
        },
      }),
    }),
  ],
  controllers: [ProfileController],
  providers: [ProfileService, AvatarStorageService],
})
export class ProfileModule {}
