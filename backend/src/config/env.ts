import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env file
dotenv.config();

const envSchema = z.object({
  PORT: z.string().transform((val) => parseInt(val, 10)).default('4000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string({
    required_error: 'DATABASE_URL environment variable is required',
  }).min(1, 'DATABASE_URL cannot be empty'),
  SUPABASE_URL: z.string({
    required_error: 'SUPABASE_URL environment variable is required',
  }).url('SUPABASE_URL must be a valid URL'),
  SUPABASE_ANON_KEY: z.string({
    required_error: 'SUPABASE_ANON_KEY environment variable is required',
  }).min(1, 'SUPABASE_ANON_KEY cannot be empty'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_SCREENSHOTS_BUCKET: z.string().default('leadflow-screenshots'),
  SUPABASE_LOGS_BUCKET: z.string().default('leadflow-logs'),
  GEMINI_API_KEY: z.string({
    required_error: 'GEMINI_API_KEY environment variable is required',
  }).min(1, 'GEMINI_API_KEY cannot be empty'),
  BROWSER_MODE: z.enum(['local', 'cdp']).default('local'),
  CHROME_CDP_PORT: z.string().transform((val) => parseInt(val, 10)).default('9222'),
});

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Environment validation failed:');
    result.error.errors.forEach((err) => {
      console.error(`   - ${err.path.join('.')}: ${err.message}`);
    });
    process.exit(1);
  }

  return result.data;
};

export const env = parseEnv();
