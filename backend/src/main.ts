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
    `API ready at ${appUrl}/${API_PREFIX} (${config.get('NODE_ENV', { infer: true })})`,
  );
  if (config.get('SWAGGER_ENABLED', { infer: true })) {
    logger.log(`Swagger at ${appUrl}/${SWAGGER_PATH}`);
  }
}

void bootstrap();
