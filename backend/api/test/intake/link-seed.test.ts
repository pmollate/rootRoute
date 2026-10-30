import { afterAll, describe, expect, it } from 'vitest';
import { pool } from '../../src/core/db/pool.js';
import { writeSeed } from '../../src/modules/intake/seedTables.js';
import { hasDb } from '../db.js';

const columns = async (table: string) => Object.fromEntries((await pool.query<{ column_name: string; data_type: string; is_nullable: string }>(
  'SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = $1', [table],
)).rows.map((r) => [r.column_name, `${r.data_type}${r.is_nullable === 'NO' ? ' not null' : ''}`]));

describe.skipIf(!hasDb)('E19 migration 103 and re-seeding (needs test database)', () => {
  afterAll(() => pool.end());

  it('CONTRACTS §5: address_confirm_tokens and the new saved_addresses columns exist (SEC-LINK-01: a hash, no token column)', async () => {
    expect(await columns('address_confirm_tokens')).toEqual({
      id: 'integer not null', token_hash: 'character not null', email_id: 'integer not null',
      issued_at: 'timestamp with time zone not null', expires_at: 'timestamp with time zone not null', issued_by: 'text not null',
      used_at: 'timestamp with time zone', revoked_at: 'timestamp with time zone', prefill: 'jsonb not null',
      confirmed_address: 'jsonb', lat: 'double precision', lon: 'double precision', map_reading: 'jsonb',
      map_lookups: 'integer not null', synthetic: 'boolean not null',
    });
    expect(await columns('saved_addresses')).toMatchObject({
      source: 'text not null', lat: 'double precision', lon: 'double precision', email_id: 'integer', confirmed_at: 'timestamp with time zone',
    });
  });

  it('REQ-LINK-05: clearing the intake emails (TRUNCATE ... CASCADE, as the route tests do) keeps the saved addresses', async () => {
    const db = await pool.connect();
    try {
      await db.query('BEGIN'); // rolled back
      const before = (await db.query('SELECT count(*)::int AS n FROM saved_addresses')).rows[0].n;
      expect(before).toBeGreaterThan(0);
      await db.query('TRUNCATE intake_extractions, outbound_messages, intake_emails, recommendations RESTART IDENTITY CASCADE');
      expect((await db.query('SELECT count(*)::int AS n FROM saved_addresses')).rows[0].n).toBe(before);
    } finally {
      await db.query('ROLLBACK');
      db.release();
    }
  });

  it('AC-LINK-05: re-seeding rebuilds the source = seed rows and keeps the source = link rows', async () => {
    const db = await pool.connect();
    try {
      await db.query('BEGIN'); // rolled back: the shared test database keeps its seed
      await db.query(`INSERT INTO saved_addresses (client_id, label, line1, line2, city, state, zip)
        VALUES ('CTEST', 'Old seed', '1 Old St', NULL, 'Atlanta', 'GA', '30303')`);
      await db.query(`INSERT INTO saved_addresses (client_id, label, line1, line2, city, state, zip, source, lat, lon, confirmed_at)
        VALUES ('CTEST', 'Confirmed by client link', '400 S Orange Ave', NULL, 'Orlando', 'FL', '32801', 'link', 28.537664, -81.37965, now())`);

      await writeSeed(db, {
        domains: [{ domain: 'ctest.example', client_id: 'CTEST' }],
        emails: [],
        addresses: [{ client_id: 'CTEST', label: 'New seed', line1: '2 New St', line2: '', city: 'Atlanta', state: 'GA', zip: '30303' }],
      });

      const rows = (await db.query<{ label: string; source: string; lat: number | null }>(
        "SELECT label, source, lat FROM saved_addresses WHERE client_id = 'CTEST' ORDER BY label",
      )).rows;
      expect(rows).toEqual([
        { label: 'Confirmed by client link', source: 'link', lat: 28.537664 },
        { label: 'New seed', source: 'seed', lat: null },
      ]);
      expect((await db.query("SELECT count(*)::int AS n FROM saved_addresses WHERE source = 'seed'")).rows[0].n).toBe(1);
      expect((await db.query('SELECT domain FROM client_domains')).rows).toEqual([{ domain: 'ctest.example' }]);
    } finally {
      await db.query('ROLLBACK');
      db.release();
    }
  });
});
