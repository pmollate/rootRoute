// Load SD-04 (client domains, saved addresses) into Postgres. Run: npm run seed (from backend/api) [-- --test]
import { config as loadEnv } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

loadEnv({ path: fileURLToPath(new URL('../../../../../.env', import.meta.url)), quiet: true });
if (process.argv.includes('--test')) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { pool } = await import('../../core/db/pool.js');

const OUT = fileURLToPath(new URL('../../../../synthetic-data/out/', import.meta.url));
function csv(name: string, optional = false): Record<string, string>[] {
  if (optional && !existsSync(OUT + name)) return [];
  const [header, ...lines] = readFileSync(OUT + name, 'utf8').trim().split('\n');
  const cols = header.split(',');
  return lines.map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v])));
}

const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('TRUNCATE client_domains, client_emails, saved_addresses');
  for (const r of csv('client_domains.csv')) {
    await client.query('INSERT INTO client_domains (domain, client_id) VALUES ($1,$2)', [r.domain, r.client_id]);
  }
  // Optional test senders on a shared domain (gmail.com): email,client_id. Not part of the generated data.
  for (const r of csv('client_emails.csv', true)) {
    await client.query('INSERT INTO client_emails (email, client_id) VALUES ($1,$2)', [r.email.toLowerCase(), r.client_id]);
  }
  for (const r of csv('saved_addresses.csv')) {
    await client.query(
      'INSERT INTO saved_addresses (client_id, label, line1, line2, city, state, zip) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [r.client_id, r.label, r.line1, r.line2 || null, r.city, r.state, r.zip],
    );
  }
  await client.query('COMMIT');
  console.log('seeded client_domains, client_emails and saved_addresses');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
  await pool.end();
}
