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
  // REQ-INT-16: longest pasted email body and subject, in characters (design settings, not data); longer is refused (400)
  INTAKE_MAX_BODY_CHARS: z.coerce.number().int().min(1000).max(200000).default(20000),
  INTAKE_MAX_SUBJECT_CHARS: z.coerce.number().int().min(50).max(2000).default(300),
  API_KEY: z.string().min(1),
  // P7 sign-in (SPEC-auth §9.2): off keeps the x-api-key path and logs auth_would_deny; on enforces the internal token
  AUTH_REQUIRED: z.enum(['on', 'off']).default('off'),
  INTERNAL_AUTH_SECRET: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()), // ≥ 32 bytes when on
  // D7 Ask LateLens: Bearer token for /api/mcp; unset or empty = endpoint off
  MCP_TOKEN: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(16).optional()),
  ALLOW_LIST: z.string().default(''),
  // E19 one-time address link (SPEC §5.17; design settings, not data). Off by default (REQ-LINK-09).
  CONFIRM_LINK: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['on', 'off']).default('off')),
  CONFIRM_LINK_HOURS: z.coerce.number().int().min(1).max(72).default(24),
  // The web app's public address (same value as the web's AUTH_URL): the link is <AUTH_URL>/confirm/<token>
  AUTH_URL: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),
  // D10 in-app assistant (SPEC §5.16; design settings, not data). Off by default (REQ-ASK-08).
  ASK_ASSISTANT: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['on', 'off']).default('off')),
  ASK_MAX_TOOL_CALLS: z.coerce.number().int().min(1).max(10).default(5),
  ASK_RATE_PER_MINUTE: z.coerce.number().int().min(1).max(100).default(10),
});

/** REQ-LINK-09: with CONFIRM_LINK=on the API refuses to start without AUTH_URL, naming the setting (fail closed). */
export function checkConfirmLink(c: Pick<z.infer<typeof Env>, 'CONFIRM_LINK' | 'AUTH_URL'>): void {
  if (c.CONFIRM_LINK === 'on' && !c.AUTH_URL) throw new Error('CONFIRM_LINK=on needs AUTH_URL: refusing to start');
  // The link is <AUTH_URL>/confirm/<token>: AUTH_URL must be the web app's origin, nothing more.
  if (c.CONFIRM_LINK === 'on' && c.AUTH_URL) {
    const u = new URL(c.AUTH_URL);
    if (u.pathname !== '/' || u.search || u.hash || u.username || u.password) {
      throw new Error('CONFIRM_LINK=on: AUTH_URL must be an origin only (https://host[:port], no path, query or fragment): refusing to start');
    }
  }
}

export const config = Env.parse(process.env);
checkConfirmLink(config);
export const allowList = new Set(
  config.ALLOW_LIST.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
);
