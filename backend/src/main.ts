import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { API_PREFIX, SWAGGER_PATH, configureApp } from './app.setup';
import { EnvVars } from './config/env.validation';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const config = app.get<ConfigService<EnvVars, true>>(ConfigService);
  const port = config.get('PORT', { infer: true });
  const appUrl = config.get('APP_URL', { infer: true });
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(
    `API listening on port ${port} — public URL ${appUrl}/${API_PREFIX} (${config.get('NODE_ENV', { infer: true })})`,
  );
  // Owner decision 2026-11-09: a shared default officer password is allowed in production;
  // say so once at startup (never the value).
  if (
    config.get('NODE_ENV', { infer: true }) === 'production' &&
    config.get('DEFAULT_OFFICER_PASSWORD', { infer: true })
  ) {
    logger.warn('Default officer password is enabled');
  }
  if (config.get('SWAGGER_ENABLED', { infer: true })) {
    logger.log(`Swagger at ${appUrl}/${SWAGGER_PATH}`);
  }
}

void bootstrap();
