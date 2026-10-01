const REQUIRED = ['DATABASE_URL', 'JWT_SECRET', 'JWT_EXPIRES_IN', 'PORT'];

export function validate(config: Record<string, unknown>) {
  const missing = REQUIRED.filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  return config;
}