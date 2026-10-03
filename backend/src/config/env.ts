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
  // Optional: Supabase is only used for remote screenshot/log storage. Without
  // it the server falls back to the local `logs/screenshots` directory, which
  // it already serves statically.
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL').optional().or(z.literal('')),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_SCREENSHOTS_BUCKET: z.string().default('leadflow-screenshots'),
  SUPABASE_LOGS_BUCKET: z.string().default('leadflow-logs'),
  // Optional: when absent (or left as the .env.example placeholder) the app
  // falls back to the deterministic offline LLM provider, so the whole
  // pipeline still runs end-to-end with zero credentials.
  GEMINI_API_KEY: z.string().optional(),
  // 'auto'   -> use Gemini when a usable key is present, otherwise offline
  // 'gemini' -> require Gemini (fail fast if the key is missing)
  // 'offline'-> always use the deterministic provider
  LLM_PROVIDER: z.enum(['auto', 'gemini', 'offline']).default('auto'),
  BROWSER_MODE: z.enum(['local', 'cdp']).default('local'),
  CHROME_CDP_PORT: z.string().transform((val) => parseInt(val, 10)).default('9222'),

  // Outbound email (SMTP). Optional: without it, approved messages can still be
  // copied or exported from the review screen, but `dispatch` refuses to run
  // rather than marking a message SENT that was never actually sent.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().transform((val) => parseInt(val, 10)).default('587'),
  SMTP_SECURE: z.string().transform((v) => v === 'true').default('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
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
