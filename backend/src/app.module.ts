import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { OriginGuard } from './common/guards/origin.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { EnvVars, validateEnv } from './config/env.validation';
import { buildDataSourceOptions } from './database/typeorm-options';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { ChangeRequestsModule } from './modules/change-requests/change-requests.module';
import { DesignationsModule } from './modules/designations/designations.module';
import { HealthModule } from './modules/health/health.module';
import { MailModule } from './modules/mail/mail.module';
import { MeetingsModule } from './modules/meetings/meetings.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ProfileModule } from './modules/profile/profile.module';
import { UsersModule } from './modules/users/users.module';
import { WingsModule } from './modules/wings/wings.module';

@Module({
  imports: [
    // Loads backend/.env and validates it; the app refuses to start on any error.
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvVars, true>) =>
        buildDataSourceOptions({
          NODE_ENV: config.get('NODE_ENV', { infer: true }),
          DB_HOST: config.get('DB_HOST', { infer: true }),
          DB_PORT: config.get('DB_PORT', { infer: true }),
          DB_USER: config.get('DB_USER', { infer: true }),
          DB_PASSWORD: config.get('DB_PASSWORD', { infer: true }),
          DB_NAME: config.get('DB_NAME', { infer: true }),
        }),
    }),

    // Global default: 100 requests per minute per IP; auth routes are stricter (auth.constants).
    // Skipped under NODE_ENV=test so e2e tests can log in many times.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvVars, true>) => ({
        throttlers: [{ name: 'default', ttl: seconds(60), limit: 100 }],
        skipIf: () => config.get('NODE_ENV', { infer: true }) === 'test',
        errorMessage:
          'অনেক বেশি অনুরোধ পাঠানো হয়েছে। কিছুক্ষণ অপেক্ষা করে আবার চেষ্টা করুন।',
      }),
    }),

    // Cron jobs (mail worker every minute, daily outbox cleanup).
    ScheduleModule.forRoot(),

    AuditModule,
    MailModule,
    NotificationsModule,
    AuthModule,
    UsersModule,
    DesignationsModule,
    WingsModule,
    ProfileModule,
    ChangeRequestsModule,
    MeetingsModule,
    HealthModule,
  ],
  providers: [
    // Global guards run in this order: rate limit → CSRF origin → login → role.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
