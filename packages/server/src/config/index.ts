import 'dotenv/config';

/**
 * Environment validation - exits if critical vars are missing
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`FATAL: Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

function optionalNumber(name: string, defaultValue: number): number {
  const value = process.env[name];
  return value ? parseInt(value, 10) : defaultValue;
}

function optionalBool(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

export const config = {
  // Server
  env: optionalEnv('NODE_ENV', 'development'),
  port: optionalNumber('PORT', 8080),
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV === 'development',
  isTest: process.env.NODE_ENV === 'test',

  // Supabase
  supabase: {
    url: requireEnv('SUPABASE_URL'),
    anonKey: requireEnv('SUPABASE_ANON_KEY'),
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },

  // OpenAI
  openai: {
    apiKey: process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || '',
    model: optionalEnv('OPENAI_MODEL', 'gpt-4o'),
    baseUrl: optionalEnv('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
  },

  // Email (optional)
  email: {
    user: process.env.EMAIL_USER || '',
    pass: process.env.EMAIL_PASS || '',
    enabled: !!(process.env.EMAIL_USER && process.env.EMAIL_PASS),
  },

  // Cache settings
  cache: {
    ttlMs: optionalNumber('CACHE_TTL_MS', 5 * 60 * 1000), // 5 minutes
    maxSize: optionalNumber('CACHE_MAX_SIZE', 100),
    authTtlMs: optionalNumber('AUTH_CACHE_TTL_MS', 60 * 1000), // 1 minute
  },

  // Event range settings
  events: {
    rangeMonths: optionalNumber('EVENT_RANGE_MONTHS', 6),
  },

  // Logging
  logging: {
    level: optionalEnv('LOG_LEVEL', 'info'),
    pretty: optionalBool('LOG_PRETTY', true),
  },

  // Debug
  debug: optionalBool('DEBUG', false),
} as const;

export type Config = typeof config;
