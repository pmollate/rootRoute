// Load SD-04 (client domains, saved addresses) into Postgres; link-confirmed addresses (E19) are kept. Run: npm run seed (from backend/api) [-- --test]
import { config as loadEnv } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type SeedData, writeSeed } from './seedTables.js';

loadEnv({ path: fileURLToPath(new URL('../../../../../.env', import.meta.url)), quiet: true });
if (process.argv.includes('--test')) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { pool } = await import('../../core/db/pool.js');

const OUT = fileURLToPath(new URL('../../../../synthetic-data/out/', import.meta.url));
function csv<T>(name: string, optional = false): T[] {
  if (optional && !existsSync(OUT + name)) return [];
  const [header, ...lines] = readFileSync(OUT + name, 'utf8').trim().split('\n');
  const cols = header.split(',');
  return lines.map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v])) as T);
}

const client = await pool.connect();
try {
  await client.query('BEGIN');
  await writeSeed(client, {
    domains: csv<SeedData['domains'][number]>('client_domains.csv'),
    // Optional test senders on a shared domain (gmail.com): email,client_id. Not part of the generated data.
    emails: csv<SeedData['emails'][number]>('client_emails.csv', true),
    addresses: csv<SeedData['addresses'][number]>('saved_addresses.csv'),
  });
  await client.query('COMMIT');
  console.log('seeded client_domains, client_emails and saved_addresses (source = seed; link rows kept)');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
  await pool.end();
}
