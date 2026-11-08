import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { EnvVars, validateEnv } from './config/env.validation';
import { buildDataSourceOptions } from './database/typeorm-options';
import { HealthModule } from './modules/health/health.module';

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

    // Global default: 100 requests per minute per IP. Auth routes get stricter limits in step 4.
    ThrottlerModule.forRoot([
      { name: 'default', ttl: seconds(60), limit: 100 },
    ]),

    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
