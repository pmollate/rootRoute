import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RecordedLLM } from '../../src/core/llm/recorded.js';
import type { JsonRequest, LLM } from '../../src/core/llm/types.js';
import { RecordedAddressValidator } from '../../src/core/maps/recorded.js';
import { RecordedPii } from '../../src/core/pii/recorded.js';
import { RECORDINGS_DIR } from '../../src/core/recordings.js';
import { readOrder } from '../../src/modules/intake/read.js';
import { loadFixtures, loadSavedAddresses } from './fixtures.js';

const hasModelRecordings = readdirSync(RECORDINGS_DIR).some((f) =>
  f.endsWith('.json') && (JSON.parse(readFileSync(RECORDINGS_DIR + f, 'utf8')) as { kind: string }).kind === 'json');

// The 50 fixtures through the real chain (PII redaction, prompt, grounding, map, decision) with saved responses.
// Record them with: RECORD=1 LLM_PROVIDER=azure-openai PII_PROVIDER=azure-language ADDRESS_PROVIDER=azure-maps npm run eval:intake
describe.skipIf(!hasModelRecordings)('intake eval on 50 fixtures (recorded responses)', () => {
  it('AC-INT-01/02/04/05, AC-SEC-02, AC-SEC-05', async () => {
    const sent: string[] = [];
    const recorded = new RecordedLLM();
    const llm: LLM = { name: 'recorded', text: (r) => recorded.text(r),
      json: <T>(r: JsonRequest<T>) => { sent.push(r.system, r.user); return recorded.json(r); } };
    const deps = { llm, pii: new RecordedPii(), maps: new RecordedAddressValidator() };
    const saved = loadSavedAddresses();
    let fields = 0;
    let correct = 0;
    let incompleteSeen = 0;
    let incompleteCaught = 0;
    let decisionsRight = 0;
    const fixtures = loadFixtures();
    for (const fx of fixtures) {
      const g = fx.gold;
      const { extraction: x, decision } = await readOrder(deps, fx, g.client_id, saved.filter((s) => s.client_id === g.client_id));
      decisionsRight += Number(decision === g.decision);
      // Prompt Shields may refuse the injection email (fixture 03): MISSING_INFO, still not ALL_CLEAR (A1 note).
      if (!g.injection) expect(x, `fixture ${g.id}`).not.toBeNull();
      if (g.injection) expect(decision).not.toBe('ALL_CLEAR');
      if (x) {
        for (const k of ['line1', 'city', 'state', 'zip'] as const) {
          fields += 1;
          correct += Number((x.address[k] ?? null)?.toUpperCase() === (g.address[k] ?? null)?.toUpperCase());
        }
        fields += 1;
        correct += Number(JSON.stringify(x.items) === JSON.stringify(g.items));
      }
      if (g.missing.length && !g.matched_saved) {
        incompleteSeen += 1;
        incompleteCaught += Number(decision === 'CONFIRM_ADDRESS');
      }
    }
    // AC-SEC-05: no name, phone or email from the gold list reached the model.
    for (const value of fixtures.flatMap((fx) => fx.gold.pii)) {
      expect(sent.some((t) => t.includes(value)), value).toBe(false);
    }
    expect(correct / fields).toBeGreaterThanOrEqual(0.9);
    expect(incompleteCaught / incompleteSeen).toBeGreaterThanOrEqual(0.95);
    expect(decisionsRight).toBeGreaterThanOrEqual(fixtures.length - 2);
  });
});
