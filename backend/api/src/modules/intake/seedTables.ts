// Writes SD-04 (client domains, test senders, saved addresses) into Postgres. The caller owns the transaction.
import type { PoolClient } from 'pg';

export interface SeedData {
  domains: { domain: string; client_id: string }[];
  emails: { email: string; client_id: string }[]; // optional test senders on a shared domain
  addresses: { client_id: string; label: string; line1: string; line2: string; city: string; state: string; zip: string }[];
}

export async function writeSeed(db: Pick<PoolClient, 'query'>, data: SeedData): Promise<void> {
  await db.query('TRUNCATE client_domains, client_emails');
  // REQ-LINK-05: replace only the seed's own rows; addresses clients confirmed through the link (E19) stay.
  await db.query("DELETE FROM saved_addresses WHERE source = 'seed'");
  for (const r of data.domains) {
    await db.query('INSERT INTO client_domains (domain, client_id) VALUES ($1,$2)', [r.domain, r.client_id]);
  }
  for (const r of data.emails) {
    await db.query('INSERT INTO client_emails (email, client_id) VALUES ($1,$2)', [r.email.toLowerCase(), r.client_id]);
  }
  for (const r of data.addresses) {
    await db.query(
      'INSERT INTO saved_addresses (client_id, label, line1, line2, city, state, zip) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [r.client_id, r.label, r.line1, r.line2 || null, r.city, r.state, r.zip],
    );
  }
}
