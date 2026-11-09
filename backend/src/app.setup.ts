import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import {
  static as serveStatic,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import helmet from 'helmet';
import { timingSafeEqual } from 'node:crypto';
import {
  accessLogMiddleware,
  requestIdMiddleware,
} from './common/middleware/request-id.middleware';
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
  const production = config.get('NODE_ENV', { infer: true }) === 'production';

  // Behind nginx: take the client IP from X-Forwarded-For (throttling, audit IPs).
  (app as NestExpressApplication).set(
    'trust proxy',
    config.get('TRUST_PROXY', { infer: true }),
  );

  app.setGlobalPrefix(API_PREFIX);

  app.use(requestIdMiddleware);
  if (config.get('NODE_ENV', { infer: true }) !== 'test')
    app.use(accessLogMiddleware());

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          // Swagger UI loads its own scripts/styles from /api/docs; inline styles + data: images.
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          ...(production ? { upgradeInsecureRequests: [] } : {}),
        },
      },
      // HSTS only on the real HTTPS server (it would break plain http://localhost).
      hsts: production
        ? { maxAge: 31_536_000, includeSubDomains: true }
        : false,
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  app.use(cookieParser());

  // Strict allowlist: only listed origins get CORS headers. Credentials allowed for auth cookies.
  app.enableCors({
    origin: config.get('CORS_ORIGINS', { infer: true }),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Content-Disposition'],
  });

  app.useGlobalPipes(createValidationPipe());

  serveUploads(app, config.get('UPLOAD_DIR', { infer: true }));

  // SIGTERM/SIGINT → onModuleDestroy / onApplicationShutdown hooks run: the DB pool closes,
  // the PDF browser closes and cron jobs stop.
  app.enableShutdownHooks();

  if (config.get('SWAGGER_ENABLED', { infer: true })) {
    const user = config.get('SWAGGER_USER', { infer: true });
    const password = config.get('SWAGGER_PASSWORD', { infer: true });
    if (user && password)
      app.use(
        [`/${SWAGGER_PATH}`, `/${SWAGGER_PATH}-json`],
        basicAuth(user, password),
      );
    SwaggerModule.setup(SWAGGER_PATH, app, createSwaggerDocument(app), {
      swaggerOptions: { persistAuthorization: true },
    });
  }
}

/** The OpenAPI document (also written to docs/openapi.json by `npm run openapi:export`). */
export function createSwaggerDocument(app: INestApplication): OpenAPIObject {
  return SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('BBS Meeting Schedule API')
      .setDescription(
        'Bangladesh Bureau of Statistics (BBS) and SID — meeting schedule system. ' +
          'Errors: `{ statusCode, message, error, requestId }` (409 meeting clashes add `blocking`).',
      )
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
      .build(),
  );
}

/** HTTP Basic auth for Swagger in production (constant-time comparison). */
function basicAuth(user: string, password: string) {
  const expected = Buffer.from(`${user}:${password}`);
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization ?? '';
    const given = header.startsWith('Basic ')
      ? Buffer.from(Buffer.from(header.slice(6), 'base64').toString('utf8'))
      : Buffer.alloc(0);
    if (given.length === expected.length && timingSafeEqual(given, expected))
      return next();
    res.setHeader(
      'WWW-Authenticate',
      'Basic realm="API docs", charset="UTF-8"',
    );
    res.status(401).send('Authentication required');
  };
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
      etag: true,
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        // Random, never-reused names → safe to cache; "private": personal photos, no shared caches.
        res.setHeader('Cache-Control', 'private, max-age=604800, immutable');
        // Lets the frontend (same site, other port) show the images.
        res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
      },
    }),
  );
}
