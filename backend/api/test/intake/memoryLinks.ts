import type { LinkRepo, LinkRow } from '../../src/modules/intake/link.js';
import type { Repo } from '../../src/modules/intake/repo.js';

const key = (s: string | null) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * In-memory stand-in for migration 103 (address_confirm_tokens, saved_addresses source 'link'). `repo` (the memory
 * intake repo) receives `confirm`'s extraction, status and audit writes; checks run before any write, as the SQL
 * transaction's WHERE clauses do.
 */
export function memoryLinks(parents: () => { id: number; in_reply_to: number | null }[], repo?: Repo) {
  const rows: LinkRow[] = [];
  const saved: Parameters<LinkRepo['saveAddress']>[0][] = [];
  const links: LinkRepo = {
    orderEmailIds: async (emailId) => {
      const all = parents();
      let root = emailId;
      for (let e = all.find((x) => x.id === root); e?.in_reply_to; e = all.find((x) => x.id === root)) root = e.in_reply_to;
      const ids = [root];
      for (let i = 0; i < ids.length; i += 1) ids.push(...all.filter((x) => x.in_reply_to === ids[i]).map((x) => x.id));
      return ids;
    },
    revokeUnused: async (ids, at, keepId) => {
      const hit = rows.filter((r) => ids.includes(r.email_id) && !r.used_at && !r.revoked_at && r.id !== keepId);
      for (const r of hit) r.revoked_at = at;
      return hit.length;
    },
    revoke: async (id, at) => {
      const r = rows[id - 1];
      if (!r.used_at && !r.revoked_at) r.revoked_at = at;
    },
    insert: async (l) => {
      rows.push({ ...l, id: rows.length + 1, used_at: null, revoked_at: null, confirmed_address: null, lat: null, lon: null,
        map_reading: null, map_lookups: 0 });
      return rows.length;
    },
    byHash: async (h) => rows.find((r) => r.token_hash === h) ?? null,
    countLookup: async (id) => (rows[id - 1].map_lookups += 1),
    setReading: async (id, reading) => { rows[id - 1].map_reading = reading; },
    confirm: async (c) => {
      if (!repo) throw new Error('memoryLinks: pass the memory intake repo to confirm');
      const r = rows[c.linkId - 1];
      if (r.used_at || r.revoked_at || r.expires_at <= c.at) return false;
      if ((await repo.getEmail(c.emailId))?.status !== 'SENT') return false;
      Object.assign(r, { used_at: c.at, confirmed_address: c.address, lat: c.pin.lat, lon: c.pin.lon, map_reading: c.reading });
      await repo.saveExtraction(c.extraction);
      await repo.setStatus(c.emailId, 'AWAITING_APPROVAL');
      await repo.logAudit(c.audit.actor, c.audit.action, `email:${c.emailId}`, c.audit.payload);
      return true;
    },
    newestFor: async (ids) => new Map(ids.flatMap((id) => {
      const r = rows.filter((x) => x.email_id === id).at(-1);
      return r ? [[id, r] as const] : [];
    })),
    saveAddress: async (a) => {
      const same = saved.some((s) => s.clientId === a.clientId && key(s.address.line1) === key(a.address.line1)
        && key(s.address.line2) === key(a.address.line2) && key(s.address.city) === key(a.address.city)
        && key(s.address.state) === key(a.address.state) && s.address.zip.slice(0, 5) === a.address.zip.slice(0, 5));
      if (same) return false;
      saved.push(a);
      return true;
    },
  };
  return { links, rows, saved };
}
