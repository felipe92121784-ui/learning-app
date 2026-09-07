/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  // Node
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.string(),

  // App
  APP_KEY: Env.schema.secret(),
  APP_URL: Env.schema.string({ format: 'url', tld: false }),

  // Initial administrator (required only when running the admin seeder)
  ADMIN_NAME: Env.schema.string.optional(),
  ADMIN_EMAIL: Env.schema.string.optional(),
  ADMIN_PASSWORD: Env.schema.secret.optional(),

  // Database
  DB_HOST: Env.schema.string({ format: 'host' }),
  DB_PORT: Env.schema.number(),
  DB_USER: Env.schema.string(),
  DB_PASSWORD: Env.schema.string(),
  DB_DATABASE: Env.schema.string(),

  // Cross-origin requests
  CORS_ORIGIN: Env.schema.string(),

  // Object storage
  S3_ENDPOINT: Env.schema.string({ format: 'url', tld: false }),
  S3_ACCESS_KEY: Env.schema.string(),
  S3_SECRET_KEY: Env.schema.string(),
  S3_BUCKET: Env.schema.string(),
  S3_REGION: Env.schema.string(),

  // Private image pyramid rendering
  IMAGE_TILE_THRESHOLD_PX: positiveInteger('IMAGE_TILE_THRESHOLD_PX', 4096),
  IMAGE_TILE_SIZE: positiveInteger('IMAGE_TILE_SIZE', 256),

  // Session
  SESSION_DRIVER: Env.schema.enum(['cookie', 'memory', 'database'] as const),
})

function positiveInteger(name: string, defaultValue: number) {
  return (key: string, value?: string): number => {
    if (value === undefined || value === '') {
      return defaultValue
    }

    const parsed = Env.schema.number({ message: `${name} must be a positive integer` })(key, value)
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
      throw new Error(`${name} must be a positive integer`)
    }

    return parsed
  }
}
