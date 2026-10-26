import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';

loadEnv({ path: fileURLToPath(new URL('../../../../../.env', import.meta.url)), quiet: true });
if (process.argv.includes('--test')) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const { migrate } = await import('./migrate.js');
const { pool } = await import('./pool.js');
try {
  const applied = await migrate();
  console.log(applied.length ? `applied: ${applied.join(', ')}` : 'up to date');
} finally {
  await pool.end();
}
