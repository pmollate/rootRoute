// Run the 50 SYNTHETIC fixtures through the real chain (PII redaction, model, grounding, map, decision) and record
// the responses for CI. Spends model credit: 50 model calls and 50 PII calls.
// Usage (from backend/api, keys in the repo-root .env):
//   RECORD=1 LLM_PROVIDER=azure-openai PII_PROVIDER=azure-language ADDRESS_PROVIDER=azure-maps npm run eval:intake
// Pass fixture ids to run only those, e.g. npm run eval:intake -- 03 26
import { createLLM } from '../src/core/llm/index.js';
import { createAddressValidator } from '../src/core/maps/index.js';
import { createPiiDetector } from '../src/core/pii/index.js';
import { readOrder } from '../src/modules/intake/read.js';
import { loadFixtures, loadSavedAddresses } from '../test/intake/fixtures.js';

const deps = { llm: createLLM(), pii: createPiiDetector(), maps: createAddressValidator() };
const saved = loadSavedAddresses();
const only = process.argv.slice(2);
const fixtures = loadFixtures().filter((fx) => only.length === 0 || only.includes(fx.gold.id));
let right = 0;
for (const fx of fixtures) {
  const g = fx.gold;
  const r = await readOrder(deps, fx, g.client_id, saved.filter((s) => s.client_id === g.client_id));
  const ok = r.decision === g.decision;
  right += Number(ok);
  console.log(`${g.id} layout ${String(g.layout).padStart(2)} ${ok ? 'ok  ' : 'MISS'} ${r.decision.padEnd(15)} (gold ${g.decision})`);
  if (!ok) {
    const a = r.extraction?.address;
    console.log(`      extracted: ${a ? [a.line1, a.city, a.state, a.zip].join(' | ') : 'none (refused or invalid)'}`
      + `  items ${JSON.stringify(r.extraction?.items ?? null)}`);
    console.log(`      gold:      ${[g.address.line1, g.address.city, g.address.state, g.address.zip].join(' | ')}`
      + `  items ${JSON.stringify(g.items)}  missing ${r.address?.missing.join(',') || '-'}`
      + `  map ${r.address?.validation ? `${r.address.validation.confidence} ${r.address.validation.issues.join('+')}` : '-'}`);
  }
}
console.log(`\n${right}/${fixtures.length} decisions match gold using ${deps.llm.name}, ${deps.pii.name}, ${deps.maps.name}`);
