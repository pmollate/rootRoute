import { afterAll, describe, expect, it } from 'vitest';
import { pool, query } from '../../src/core/db/pool.js';
import { linkRepo, SAVED_ADDRESSES_SQL } from '../../src/modules/intake/repo.js';
import { writeSeed } from '../../src/modules/intake/seedTables.js';
import { hashToken, newToken } from '../../src/modules/intake/linkRules.js';
import { hasDb } from '../db.js';

const ADDRESS = { line1: '400 S Orange Ave', line2: null, city: 'Orlando', state: 'FL', zip: '32801' };
const PIN = { lat: 28.537664, lon: -81.37965 };

describe.skipIf(!hasDb)('E19 link store on migration 103 (needs test database)', () => {
  const emailIds: number[] = [];
  const email = async (inReplyTo: number | null, tag: string) => {
    const id = (await query<{ id: number }>(
      `INSERT INTO intake_emails (source, from_addr, subject, body, received_at, in_reply_to, hash, client_id, status)
       VALUES ('paste', 'orders@client190.example', '[SYNTHETIC] link-repo test', 'x', '2026-10-29 09:00', $1, $2, 'C190', 'APPROVED')
       RETURNING id`, [inReplyTo, `link-repo-test-${tag}-${Date.now()}`]))[0].id;
    emailIds.push(id);
    return id;
  };

  afterAll(async () => {
    if (emailIds.length) {
      await query('DELETE FROM address_confirm_tokens WHERE email_id = ANY($1::int[])', [emailIds]);
      await query("DELETE FROM saved_addresses WHERE source = 'link' AND email_id = ANY($1::int[])", [emailIds]);
      await query('DELETE FROM intake_emails WHERE id = ANY($1::int[]) AND in_reply_to IS NOT NULL', [emailIds]);
      await query('DELETE FROM intake_emails WHERE id = ANY($1::int[])', [emailIds]);
    }
    await pool.end();
  });

  it('REQ-LINK-08, SEC-LINK-01, SEC-LINK-02, SEC-LINK-04: the SQL store walks the thread, keeps only the hash, uses a link once and counts look-ups', async () => {
    const first = await email(null, 'a');
    const follow = await email(first, 'b');
    expect(await linkRepo.orderEmailIds(follow)).toEqual([first, follow]);
    expect(await linkRepo.orderEmailIds(first)).toEqual([first, follow]);

    const now = new Date('2026-10-29T10:00:00Z');
    const hash = hashToken(newToken());
    const id = await linkRepo.insert({ token_hash: hash, email_id: first, issued_at: now, expires_at: new Date('2026-10-30T06:00:00Z'),
      issued_by: 'u1', prefill: { address: { city: 'Orlando', state: 'FL' }, pin: null }, synthetic: true });
    const row = (await linkRepo.byHash(hash))!;
    expect(row).toMatchObject({ id, email_id: first, issued_by: 'u1', used_at: null, revoked_at: null, map_lookups: 0, synthetic: true,
      prefill: { address: { city: 'Orlando', state: 'FL' }, pin: null } });
    expect(row.expires_at).toEqual(new Date('2026-10-30T06:00:00Z'));
    expect(await linkRepo.byHash(hashToken(newToken()))).toBeNull();

    expect(await linkRepo.countLookup(id)).toBe(1);
    expect(await linkRepo.countLookup(id)).toBe(2);
    const pending = { checkId: 'c1', pin: PIN, zip: '32801', reading: { line1: null, city: 'Orlando', state: 'FL', zip: '32801', distanceM: 0 } };
    await linkRepo.setReading(id, pending);
    expect((await linkRepo.byHash(hash))!.map_reading).toEqual(pending);

    // Expired at `at`: refused. Live: used once; a second (racing) confirmation is refused by the WHERE clause.
    expect(await linkRepo.markUsed(id, ADDRESS, PIN, pending.reading, new Date('2026-10-30T06:00:00Z'))).toBe(false);
    const [a, b] = await Promise.all([linkRepo.markUsed(id, ADDRESS, PIN, pending.reading, now), linkRepo.markUsed(id, ADDRESS, PIN, null, now)]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(await linkRepo.byHash(hash)).toMatchObject({ used_at: now, confirmed_address: ADDRESS, lat: PIN.lat, lon: PIN.lon });

    // A new link for the follow-up revokes every unused link of the thread; a used one stays used.
    const live = await linkRepo.insert({ token_hash: hashToken(newToken()), email_id: first, issued_at: now, expires_at: new Date('2026-10-30T06:00:00Z'),
      issued_by: 'u1', prefill: { address: {}, pin: null }, synthetic: true });
    expect(await linkRepo.revokeUnused(await linkRepo.orderEmailIds(follow), now)).toBe(1);
    const newest = await linkRepo.newestFor([first, follow]);
    expect([...newest.keys()]).toEqual([first]);
    expect(newest.get(first)).toMatchObject({ id: live, revoked_at: now });
    expect((await linkRepo.byHash(hash))!.revoked_at).toBeNull();

    await linkRepo.saveAddress({ clientId: 'C190', address: ADDRESS, pin: PIN, emailId: first, confirmedAt: now, synthetic: true });
    expect((await query('SELECT client_id, label, line1, line2, city, state, zip, synthetic, source, lat, lon, email_id, confirmed_at FROM saved_addresses WHERE email_id = $1 AND source = \'link\'', [first])))
      .toEqual([{ client_id: 'C190', label: 'Confirmed by client link', ...ADDRESS, synthetic: true, source: 'link', lat: PIN.lat, lon: PIN.lon,
        email_id: first, confirmed_at: now }]);
  });

  it('AC-LINK-05, REQ-LINK-05: saved addresses keep the same order after a re-seed with a link row present (seed rows first, then link rows)', async () => {
    const db = await pool.connect();
    try {
      await db.query('BEGIN'); // rolled back: the shared test database keeps its seed
      const seed = {
        domains: [{ domain: 'ctest.example', client_id: 'CTEST' }], emails: [],
        addresses: [
          { client_id: 'CTEST', label: 'Zeta dock', line1: '9 Z St', line2: '', city: 'Atlanta', state: 'GA', zip: '30303' },
          { client_id: 'CTEST', label: 'Alpha dock', line1: '1 A St', line2: '', city: 'Atlanta', state: 'GA', zip: '30303' },
        ],
      };
      await writeSeed(db, seed);
      await db.query(`INSERT INTO saved_addresses (client_id, label, line1, line2, city, state, zip, source, lat, lon, confirmed_at)
        VALUES ('CTEST', 'Confirmed by client link', '400 S Orange Ave', NULL, 'Orlando', 'FL', '32801', 'link', 28.537664, -81.37965, now())`);
      const strip = (rows: { label: string }[]) => rows.map((r) => r.label);
      const before = strip((await db.query<{ label: string }>(SAVED_ADDRESSES_SQL, ['CTEST'])).rows);
      expect(before).toEqual(['Zeta dock', 'Alpha dock', 'Confirmed by client link']);

      await writeSeed(db, seed); // the seed rows get new, higher ids than the link row
      const after = (await db.query<{ id: number; label: string }>(SAVED_ADDRESSES_SQL, ['CTEST'])).rows;
      expect(strip(after)).toEqual(before);
      expect(after[2].id).toBeLessThan(after[0].id); // the order does not follow id across sources
      expect(Object.keys(after[0]).sort()).toEqual(['city', 'client_id', 'id', 'label', 'line1', 'line2', 'state', 'zip']);
    } finally {
      await db.query('ROLLBACK');
      db.release();
    }
  });
});
