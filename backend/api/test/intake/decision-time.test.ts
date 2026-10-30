import { afterAll, describe, expect, it } from 'vitest';
import { pool, query } from '../../src/core/db/pool.js';
import { getDeps, setDeps } from '../../src/modules/intake/deps.js';
import { processEmail } from '../../src/modules/intake/pipeline.js';
import { hasDb } from '../db.js';
import { loadFixtures } from './fixtures.js';

/** NFR-02: the intake agent should reach a decision within 30 s per email. */
const LIMIT_MS = 30_000;

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];

// The whole chain per email (store, client look-up, PII, extraction, address and map check, decision, promise, warehouse,
// carrier, reply draft, saved extraction) on the test database, with the recorded PII, model and map answers. It times
// our code and Postgres; live Azure calls add their own latency on top (measured by the eval run, not here).
describe.skipIf(!hasDb)('decision time on the 50 fixtures (needs test database)', () => {
  afterAll(() => pool.end());

  it('AC-NFR-02: each of the 50 fixtures reaches a decision within 30 s; p50, p95 and max are printed', async () => {
    await query('TRUNCATE intake_extractions, outbound_messages, intake_emails RESTART IDENTITY CASCADE');
    setDeps({ gmail: null });
    const deps = getDeps();
    const fixtures = loadFixtures();
    expect(fixtures).toHaveLength(50);
    const times: { id: string; ms: number; decision: string | null; gold: string }[] = [];
    for (const fx of fixtures) {
      const start = performance.now();
      const r = await processEmail({ from: fx.gold.from, subject: fx.subject, body: fx.body, receivedAt: fx.gold.received_at,
        source: 'paste' }, deps);
      const ms = performance.now() - start;
      times.push({ id: fx.gold.id, ms, decision: r.decision, gold: fx.gold.decision });
      expect(r.status, `fixture ${fx.gold.id}`).not.toBe('WAITING'); // a decision was reached, not deferred
      expect(r.decision, `fixture ${fx.gold.id}`).not.toBeNull();
      expect(ms, `fixture ${fx.gold.id}`).toBeLessThan(LIMIT_MS);
    }
    // The decisions are the real ones (as the eval: at most 2 differ from gold), so the time is for the whole chain.
    expect(times.filter((t) => t.decision === t.gold).length).toBeGreaterThanOrEqual(times.length - 2);
    const sorted = times.map((t) => t.ms).sort((a, b) => a - b);
    const s = (ms: number) => (ms / 1000).toFixed(3);
    // Quoted in docs/agent-runs (S1): seconds per decision with recorded AI answers.
    process.stdout.write(`AC-NFR-02 decision time over ${sorted.length} fixtures: p50 ${s(pct(sorted, 50))} s, p95 ${s(pct(sorted, 95))} s, `
      + `max ${s(sorted.at(-1)!)} s (limit ${LIMIT_MS / 1000} s)\n`);
  }, 50 * LIMIT_MS);
});
