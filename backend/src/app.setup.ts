import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { EnvVars } from './config/env.validation';

export const API_PREFIX = 'api/v1';
export const SWAGGER_PATH = 'api/docs';

/**
 * HTTP-level setup shared by main.ts and the e2e tests, so tests run against
 * the same security baseline as the real server.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get<ConfigService<EnvVars, true>>(ConfigService);

  app.setGlobalPrefix(API_PREFIX);

  app.use(helmet());
  app.use(cookieParser());

  // Strict allowlist: only listed origins get CORS headers. Credentials allowed for auth cookies.
  app.enableCors({
    origin: config.get('CORS_ORIGINS', { infer: true }),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown properties...
      forbidNonWhitelisted: true, // ...and reject the request if any were sent
      transform: true, // turn payloads into DTO instances (and query strings into numbers etc.)
    }),
  );

  app.enableShutdownHooks();

  if (config.get('SWAGGER_ENABLED', { infer: true })) {
    setupSwagger(app);
  }
}

function setupSwagger(app: INestApplication): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('BBS Meeting Schedule API')
      .setDescription(
        'Bangladesh Bureau of Statistics (BBS) and SID — meeting schedule system',
      )
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
      .build(),
  );
  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
}
