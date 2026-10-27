import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';

loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://latelens:latelens@localhost:5432/latelens_test';
process.env.NODE_ENV = 'test';
process.env.LLM_PROVIDER = 'recorded';
process.env.PII_PROVIDER = 'recorded';
process.env.ADDRESS_PROVIDER = 'recorded';
process.env.API_KEY = 'test-key';
process.env.ALLOW_LIST = 'ops-test@latelens.example,orders@client190.example';
