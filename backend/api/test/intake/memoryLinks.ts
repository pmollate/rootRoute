import type { LinkRepo, LinkRow } from '../../src/modules/intake/link.js';

/** In-memory stand-in for migration 103 (address_confirm_tokens, saved_addresses source 'link'). */
export function memoryLinks(parents: () => { id: number; in_reply_to: number | null }[]) {
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
    revokeUnused: async (ids, at) => {
      const hit = rows.filter((r) => ids.includes(r.email_id) && !r.used_at && !r.revoked_at);
      for (const r of hit) r.revoked_at = at;
      return hit.length;
    },
    insert: async (l) => {
      rows.push({ ...l, id: rows.length + 1, used_at: null, revoked_at: null, confirmed_address: null, lat: null, lon: null,
        map_reading: null, map_lookups: 0 });
      return rows.length;
    },
    byHash: async (h) => rows.find((r) => r.token_hash === h) ?? null,
    countLookup: async (id) => (rows[id - 1].map_lookups += 1),
    setReading: async (id, reading) => { rows[id - 1].map_reading = reading; },
    markUsed: async (id, address, pin, reading, at) => {
      const r = rows[id - 1];
      if (r.used_at || r.revoked_at || r.expires_at <= at) return false;
      Object.assign(r, { used_at: at, confirmed_address: address, lat: pin.lat, lon: pin.lon, map_reading: reading });
      return true;
    },
    newestFor: async (ids) => new Map(ids.flatMap((id) => {
      const r = rows.filter((x) => x.email_id === id).at(-1);
      return r ? [[id, r] as const] : [];
    })),
    saveAddress: async (a) => { saved.push(a); },
  };
  return { links, rows, saved };
}
