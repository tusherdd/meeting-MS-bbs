import * as Joi from 'joi';

/**
 * Typed shape of the validated environment (SPEC.md §10).
 * Use with `ConfigService<EnvVars, true>` and `config.get('KEY', { infer: true })`.
 */
export interface EnvVars {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  APP_URL: string;
  FRONTEND_URL: string;
  /** Parsed from a comma-separated list into exact origins. */
  CORS_ORIGINS: string[];
  TZ: string;

  DB_HOST: string;
  DB_PORT: number;
  DB_USER: string;
  DB_PASSWORD: string;
  DB_NAME: string;

  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_ACCESS_TTL: string;
  JWT_REFRESH_TTL: string;

  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_SECURE: boolean;
  SMTP_USER: string;
  SMTP_PASSWORD: string;
  MAIL_FROM: string;
  MAIL_DRY_RUN: boolean;

  UPLOAD_DIR: string;
  MAX_UPLOAD_MB: number;
  SWAGGER_ENABLED: boolean;

  SEED_SUPER_ADMIN_EMAIL: string;
  SEED_SUPER_ADMIN_PASSWORD: string;
}

const MIN_SECRET_LENGTH = 32;
/** Durations such as 15m, 7d, 3600s, 12h. */
const TTL_PATTERN = /^\d+[smhd]$/;

const urlSchema = Joi.string().uri({ scheme: ['http', 'https'] });

/**
 * Comma-separated list of origins → string[].
 * Each entry must be an exact origin (scheme://host[:port], no path or trailing slash),
 * because that is what browsers send in the Origin header.
 */
const corsOriginsSchema = Joi.string()
  .required()
  .custom((value: string, helpers) => {
    const origins = value
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0);
    if (origins.length === 0) {
      return helpers.message({
        custom: 'CORS_ORIGINS must list at least one origin',
      });
    }
    for (const origin of origins) {
      let parsed: URL;
      try {
        parsed = new URL(origin);
      } catch {
        return helpers.message({
          custom: `CORS_ORIGINS entry "${origin}" is not a valid URL`,
        });
      }
      if (
        !['http:', 'https:'].includes(parsed.protocol) ||
        parsed.origin !== origin
      ) {
        return helpers.message({
          custom: `CORS_ORIGINS entry "${origin}" must be an exact origin like https://meeting.bbs.gov.bd`,
        });
      }
    }
    return origins;
  });

export const envSchema = Joi.object<EnvVars>({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(4000),
  APP_URL: urlSchema.required(),
  FRONTEND_URL: urlSchema.required(),
  CORS_ORIGINS: corsOriginsSchema,
  TZ: Joi.string().default('Asia/Dhaka'),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().port().default(5432),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),

  JWT_ACCESS_SECRET: Joi.string().min(MIN_SECRET_LENGTH).required(),
  // Must differ from the access secret, otherwise an access token could be replayed as a refresh token.
  JWT_REFRESH_SECRET: Joi.string()
    .min(MIN_SECRET_LENGTH)
    .required()
    .invalid(Joi.ref('JWT_ACCESS_SECRET'))
    .messages({
      'any.invalid':
        '"JWT_REFRESH_SECRET" must be different from JWT_ACCESS_SECRET',
    }),
  JWT_ACCESS_TTL: Joi.string().pattern(TTL_PATTERN).default('15m'),
  JWT_REFRESH_TTL: Joi.string().pattern(TTL_PATTERN).default('7d'),

  SMTP_HOST: Joi.string().required(),
  SMTP_PORT: Joi.number().port().default(587),
  SMTP_SECURE: Joi.boolean().default(false),
  SMTP_USER: Joi.string().allow('').default(''),
  SMTP_PASSWORD: Joi.string().allow('').default(''),
  MAIL_FROM: Joi.string().required(),
  MAIL_DRY_RUN: Joi.boolean().default(true),

  UPLOAD_DIR: Joi.string().default('./uploads'),
  MAX_UPLOAD_MB: Joi.number().positive().max(50).default(2),
  // Off unless explicitly enabled (SPEC.md §9.14).
  SWAGGER_ENABLED: Joi.boolean().default(false),

  SEED_SUPER_ADMIN_EMAIL: Joi.string()
    .email({ tlds: false })
    .default('admin@bbs.gov.bd'),
  // Only needed when running seeds (checked by the seed script, not at API startup).
  SEED_SUPER_ADMIN_PASSWORD: Joi.string().allow('').default(''),
});

/**
 * Validates raw environment values. Throws (and so stops the app / CLI) on any problem,
 * listing every error at once. Unknown variables (PATH, HOME, ...) are ignored.
 */
export function validateEnv(raw: Record<string, unknown>): EnvVars {
  const result = envSchema.validate(raw, {
    abortEarly: false,
    allowUnknown: true,
    convert: true,
  });
  if (result.error) {
    const details = result.error.details
      .map((d) => `  - ${d.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  // Narrowed by the check above: `value` is the validated, converted EnvVars.
  return result.value;
}
