import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

export const env = {
  DATABASE_URL: required('DATABASE_URL'),
  JWT_SECRET: required('JWT_SECRET'),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? '30d',
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  PORT: Number(process.env.PORT ?? 4000),
  // Google OAuth Web client ID — used to verify ID tokens from the frontend.
  GOOGLE_CLIENT_ID: required('GOOGLE_CLIENT_ID'),
  // Email that is auto-promoted to admin on sign-in. Optional; empty disables.
  SEED_ADMIN_EMAIL: (process.env.SEED_ADMIN_EMAIL ?? '').toLowerCase(),
};
