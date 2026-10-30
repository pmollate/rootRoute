// Writes SD-04 (client domains, test senders, saved addresses) into Postgres. The caller owns the transaction.
import type { PoolClient } from 'pg';

export interface SeedData {
  domains: { domain: string; client_id: string }[];
  emails: { email: string; client_id: string }[]; // optional test senders on a shared domain
  addresses: { client_id: string; label: string; line1: string; line2: string; city: string; state: string; zip: string }[];
}

/**
 * E16: test senders from the CLIENT_EMAILS setting, "email:client_id" pairs separated by commas, so a deployed seed
 * (which has no client_emails.csv) still knows them. Throws on a malformed pair rather than seeding half a list.
 */
export function parseClientEmails(value: string | undefined): SeedData['emails'] {
  return (value ?? '').split(',').map((s) => s.trim()).filter(Boolean).map((pair) => {
    const [email, clientId, extra] = pair.split(':').map((s) => s.trim());
    if (extra !== undefined || !/^[^@\s]+@[^@\s]+$/.test(email ?? '') || !/^C\d{3}$/.test(clientId ?? '')) {
      throw new Error(`CLIENT_EMAILS: "${pair}" is not email:client_id (e.g. someone@gmail.com:C190)`);
    }
    return { email: email.toLowerCase(), client_id: clientId };
  });
}

export async function writeSeed(db: Pick<PoolClient, 'query'>, data: SeedData): Promise<void> {
  await db.query('TRUNCATE client_domains, client_emails');
  // REQ-LINK-05: replace only the seed's own rows; addresses clients confirmed through the link (E19) stay.
  await db.query("DELETE FROM saved_addresses WHERE source = 'seed'");
  for (const r of data.domains) {
    await db.query('INSERT INTO client_domains (domain, client_id) VALUES ($1,$2)', [r.domain, r.client_id]);
  }
  for (const r of data.emails) {
    // The same address in the CSV and in CLIENT_EMAILS: the later row (the setting) wins.
    await db.query(
      'INSERT INTO client_emails (email, client_id) VALUES ($1,$2) ON CONFLICT (email) DO UPDATE SET client_id = EXCLUDED.client_id',
      [r.email.toLowerCase(), r.client_id],
    );
  }
  for (const r of data.addresses) {
    await db.query(
      'INSERT INTO saved_addresses (client_id, label, line1, line2, city, state, zip) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [r.client_id, r.label, r.line1, r.line2 || null, r.city, r.state, r.zip],
    );
  }
}
