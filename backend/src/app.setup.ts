import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { static as serveStatic } from 'express';
import helmet from 'helmet';
import { createValidationPipe } from './common/pipes/validation.pipe';
import {
  ensureUploadDirs,
  resolveUploadRoot,
  UPLOADS_URL_PREFIX,
} from './common/utils/uploads';
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

  app.useGlobalPipes(createValidationPipe());

  serveUploads(app, config.get('UPLOAD_DIR', { infer: true }));

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

/**
 * Uploaded files (avatars) are served read-only at /uploads (SPEC.md §9.9): GET/HEAD only,
 * no directory listing, no index files, no dotfiles, and nosniff so a file is never run as
 * another type. Files are always our own re-encoded WebP images with random names.
 */
function serveUploads(app: INestApplication, uploadDir: string): void {
  const root = resolveUploadRoot(uploadDir);
  ensureUploadDirs(root);
  app.use(
    UPLOADS_URL_PREFIX,
    serveStatic(root, {
      index: false,
      dotfiles: 'deny',
      redirect: false,
      fallthrough: true,
      maxAge: '7d', // file names are random and never reused
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        // Lets the frontend (same site, other port) show the images.
        res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
      },
    }),
  );
}
