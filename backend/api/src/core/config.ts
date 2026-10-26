import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

loadEnv({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)), quiet: true });

const Env = z.object({
  NODE_ENV: z.string().default('development'),
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(3001),
  LLM_PROVIDER: z.enum(['claude', 'azure-openai', 'recorded']).default('recorded'),
  LLM_MODEL: z.string().default('claude-opus-5-5'),
  RECORD: z.string().optional(),
  API_KEY: z.string().min(1),
  ALLOW_LIST: z.string().default(''),
});

export const config = Env.parse(process.env);
export const allowList = new Set(
  config.ALLOW_LIST.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
);
