import type { DeliveryCauses, DiagnosisApi } from '../../core/contracts.js';
import { query } from '../../core/db/pool.js';
import type { LLM } from '../../core/llm/types.js';
import { isPriority } from './priority.js';

export interface ComplaintRow {
  complaint_id: string; complaint_date: string; client_id: string; delivery_id: string; channel: string;
  category: string; escalated_to_account_owner: string; text: string; at_risk: boolean; account_tier: string;
}

const CAUSE_TEXT: Record<string, string> = {
  f_addr: 'the delivery address was incomplete when the order arrived',
  f_cutoff: 'the same-day order arrived after the 8am pick-list cut-off',
  f_stock: 'it shipped from a warehouse further away',
  f_bad_lane: 'it went with a carrier that is unreliable on this lane',
  f_d_friday: 'it went with carrier D on a Friday, when D is overloaded',
  f_route: 'the driver ran more than 20% over the planned route',
};
const PRE_PICKUP = new Set(['Intake', 'Promise', 'Fulfilment']);

export function causeSentences(c: DeliveryCauses): string[] {
  return Object.entries(CAUSE_TEXT).filter(([f]) => c.flags[f as keyof DeliveryCauses['flags']]).map(([, t]) => t);
}

export function templateResponse(row: ComplaintRow, c: DeliveryCauses | null): string {
  const found = c ? causeSentences(c) : [];
  const cause = found.length ? `We checked delivery ${row.delivery_id}: ${found.join('; ')}.` : `We are checking delivery ${row.delivery_id}.`;
  return `Thank you for telling us. ${cause} We are fixing this step so it does not happen again, and your account owner will follow up.\n\nHalcyon Logistics`;
}

/** Numbers in a draft must come from the facts given to the model (AC-CMP-02). */
export function onlyKnownNumbers(draft: string, facts: string): boolean {
  const known = new Set(facts.match(/\d+/g) ?? []);
  return (draft.match(/\d+/g) ?? []).every((n) => known.has(n));
}

export async function triage(llm: LLM, diagnosis: DiagnosisApi, row: ComplaintRow) {
  const causes = await diagnosis.getDeliveryCauses(row.delivery_id);
  const stages = causes?.stages ?? [];
  const facts = JSON.stringify({ complaint: row.text, category: row.category, delivery_id: row.delivery_id,
    causes: causes ? causeSentences(causes) : [], stages });
  let draft = templateResponse(row, causes);
  let source: 'model' | 'template' = 'template';
  try {
    const text = await llm.text({
      system: 'Write a short apology to a logistics client about one late delivery. Use only the facts given. State the cause found and the next step. Under 90 words. Sign "Halcyon Logistics".',
      user: facts,
    });
    if (text && onlyKnownNumbers(text, facts)) {
      draft = text;
      source = 'model';
    }
  } catch {
    // keep the template
  }
  return { complaintId: row.complaint_id, deliveryId: row.delivery_id, stages,
    prePickup: stages.some((s) => PRE_PICKUP.has(s)), escalate: isPriority(row.account_tier, row.at_risk), draft, source };
}

export const listComplaints = () => query<ComplaintRow>(
  'SELECT m.*, c.account_tier FROM complaints m JOIN clients c USING (client_id) ORDER BY m.complaint_id',
);

export async function saveTriage(t: Awaited<ReturnType<typeof triage>>): Promise<void> {
  await query(
    'INSERT INTO complaint_triage (complaint_id, delivery_id, stages, escalate, draft, draft_source) VALUES ($1,$2,$3,$4,$5,$6)',
    [t.complaintId, t.deliveryId, JSON.stringify(t.stages), t.escalate, t.draft, t.source],
  );
}
