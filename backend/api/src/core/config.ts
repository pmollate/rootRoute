import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

loadEnv({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)), quiet: true });

export const Env = z.object({
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
  INTAKE_POLL_MINUTES: z.coerce.number().int().min(0).max(60).default(10), // E15: Gmail poll interval; 0 = off
  API_KEY: z.string().min(1),
  // P7 sign-in (SPEC-auth §9.2): off keeps the x-api-key path and logs auth_would_deny; on enforces the internal token
  AUTH_REQUIRED: z.enum(['on', 'off']).default('off'),
  INTERNAL_AUTH_SECRET: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()), // ≥ 32 bytes when on
  // D7 Ask LateLens: Bearer token for /api/mcp; unset or empty = endpoint off
  MCP_TOKEN: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(16).optional()),
  ALLOW_LIST: z.string().default(''),
  // D10 in-app assistant (SPEC §5.16; design settings, not data). Off by default (REQ-ASK-08).
  ASK_ASSISTANT: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['on', 'off']).default('off')),
  ASK_MAX_TOOL_CALLS: z.coerce.number().int().min(1).max(10).default(5),
  ASK_RATE_PER_MINUTE: z.coerce.number().int().min(1).max(100).default(10),
});

export const config = Env.parse(process.env);
export const allowList = new Set(
  config.ALLOW_LIST.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
);
