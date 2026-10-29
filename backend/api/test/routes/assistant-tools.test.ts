import { afterAll, describe, expect, it } from 'vitest';
import { pool } from '../../src/core/db/pool.js';
import { TOOLS } from '../../src/modules/mcp/tools.js';
import { REPLAY_SEGMENTS, SEGMENTS } from '../../src/modules/warehouse/queries.js';
import { hasDb } from '../db.js';

const CALLS: Record<string, object[]> = {
  overview: [{}],
  delivery_causes: SEGMENTS.map((segment) => ({ segment })),
  scenario: REPLAY_SEGMENTS.map((segment) => ({ segment })),
  lane_scores: [{}, ...['Midwest', 'Northeast', 'Southeast', 'West'].flatMap((region) =>
    ['same_day', 'next_day', 'standard'].map((commitment) => ({ region, commitment })))],
  recommend_carrier: ['Midwest', 'Northeast', 'Southeast', 'West'].flatMap((region) =>
    ['same_day', 'next_day', 'standard'].map((commitment) => ({ region, commitment, slaClause: true }))),
  check_promise: ['2026-10-28 07:59', '2026-10-28 08:00', '2026-10-30 17:45'].flatMap((receivedAt) =>
    ['same_day', 'next_day', 'standard'].map((commitment) => ({ commitment, receivedAt }))),
};
const PERSONAL_KEY = /name|email|phone|address|street|line1|zip|contact|body|text/i;

function keys(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => keys(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push(k); keys(x, out); }
  return out;
}

describe.skipIf(!hasDb)('registry tools return aggregates only (needs test database)', () => {
  afterAll(() => pool.end());
  it('AC-SEC-ASK-04: no personal key and no email address in any tool output', async () => {
    for (const t of TOOLS) {
      for (const args of CALLS[t.name]) {
        const out = await t.run(args as never);
        const found = keys(out).filter((k) => PERSONAL_KEY.test(k));
        expect(found, `${t.name} ${JSON.stringify(args)}`).toEqual([]);
        expect(JSON.stringify(out)).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
      }
    }
  });
});
