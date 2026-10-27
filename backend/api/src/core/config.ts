import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

loadEnv({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)), quiet: true });

const Env = z.object({
  NODE_ENV: z.string().default('development'),
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(3001),
  LLM_PROVIDER: z.enum(['azure-openai', 'recorded']).default('recorded'),
  AZURE_OPENAI_ENDPOINT: z.string().optional(), // v1 endpoint: https://<resource>.openai.azure.com/openai/v1/
  AZURE_OPENAI_API_KEY: z.string().optional(),
  AZURE_OPENAI_DEPLOYMENT: z.string().optional(), // the deployment name in Foundry, not the model name
  PII_PROVIDER: z.enum(['azure-language', 'recorded']).default('recorded'),
  AZURE_LANGUAGE_ENDPOINT: z.string().optional(), // https://<resource>.cognitiveservices.azure.com
  AZURE_LANGUAGE_KEY: z.string().optional(),
  ADDRESS_PROVIDER: z.enum(['azure-maps', 'recorded']).default('recorded'),
  AZURE_MAPS_KEY: z.string().optional(), // Azure Maps account shared key (Authentication tab)
  RECORD: z.string().optional(),
  GMAIL_ACCOUNT: z.string().optional(), // the demo inbox; scripts refuse to touch any other account
  GMAIL_CLIENT_ID: z.string().optional(),
  GMAIL_CLIENT_SECRET: z.string().optional(),
  GMAIL_REFRESH_TOKEN: z.string().optional(),
  API_KEY: z.string().min(1),
  ALLOW_LIST: z.string().default(''),
});

export const config = Env.parse(process.env);
export const allowList = new Set(
  config.ALLOW_LIST.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
);
