import * as Joi from 'joi';

// Boot-time env contract. ConfigModule.forRoot({ validationSchema }) runs this
// against process.env at startup so a missing/garbage required var fails FAST
// (loud crash on boot) instead of lazily exploding deep inside a request.
//
// `allowUnknown: true` (see app.module) lets unrelated env (PATH, PORT,
// NODE_ENV, SEED_*) through untouched — we only assert the keys we depend on.
export const envValidationSchema = Joi.object({
  // Datastores.
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .required(),

  // Auth — secrets must be present; TTLs are positive integers (seconds).
  JWT_ACCESS_SECRET: Joi.string().min(1).required(),
  JWT_REFRESH_SECRET: Joi.string().min(1).required(),
  JWT_ACCESS_TTL: Joi.number().integer().positive().required(),
  JWT_REFRESH_TTL: Joi.number().integer().positive().required(),

  // Credentials are enabled, so a concrete origin is mandatory (no wildcard).
  CORS_ORIGIN: Joi.string().min(1).required(),
});
