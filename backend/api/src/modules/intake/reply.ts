import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { PromiseResult } from '../../core/contracts.js';
import type { LLM } from '../../core/llm/types.js';
import type { AddressQuery } from '../../core/maps/types.js';
import type { Decision } from './decide.js';
import type { SavedAddress } from './schema.js';
import type { AddressIssue } from './validate.js';

/** Checked facts only: the model never sees the raw email when drafting (SEC-02). Names stay as tags (SEC-05). */
export interface ReplyFacts {
  decision: Decision;
  clientName: string | null;
  contact: string | null;          // a PII tag such as [PERSON_1]; restore() fills it in after approval
  items: { sku: string; qty: number }[];
  promise: PromiseResult | null;
  missing: string[];               // e.g. ["address.line1", "address.zip"]
  candidates: SavedAddress[];
  address: string | null;          // the address as given, when the map could not confirm it
  addressIssues: AddressIssue[];
  suggestion: AddressQuery | null; // the map's reading (never a different street)
}

const FIELD_LABEL: Record<string, string> = {
  'address.line1': 'street address', 'address.city': 'city', 'address.state': 'state', 'address.zip': 'ZIP code',
};
const ISSUE_LABEL: Record<AddressIssue, string> = { street_not_found: 'street address', zip_mismatch: 'ZIP code', state_mismatch: 'state' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function missingLabels(missing: string[]): string[] {
  return missing.map((m) => FIELD_LABEL[m] ?? m);
}

function addressLine(s: SavedAddress): string {
  return `${s.label}: ${[s.line1, s.line2, `${s.city}, ${s.state} ${s.zip}`].filter(Boolean).join(', ')}`;
}

/** Strings that must appear verbatim in any reply for these facts. */
export function requiredPhrases(f: ReplyFacts): string[] {
  const out: string[] = [];
  if (f.promise) out.push(formatDate(f.promise.promiseDate));
  if (f.decision === 'CONFIRM_ADDRESS') {
    out.push(...missingLabels(f.missing), ...f.addressIssues.map((i) => ISSUE_LABEL[i]));
    if (f.addressIssues.includes('zip_mismatch') && f.suggestion) out.push(f.suggestion.zip);
  }
  return [...new Set(out)];
}

/** What the map could not confirm, in the client's terms. */
function issueSentences(f: ReplyFacts): string {
  const s = f.suggestion;
  const given = /,\s*([^,]+),\s*([A-Z]{2})\s+(\d{5})/.exec(f.address ?? '');
  const [city, state, zip] = given ? [given[1], given[2], given[3]] : [s?.city ?? '', s?.state ?? '', ''];
  const street = (f.address ?? '').split(',')[0];
  return f.addressIssues.map((issue) => {
    if (issue === 'street_not_found') return `We could not find ${street} in ${city}, ${state}.`;
    if (issue === 'zip_mismatch') return `The ZIP code ${zip} does not match ${city}, ${state}${s ? `; the map shows ${s.zip} for this street` : ''}.`;
    return `The state does not match ${city}.`;
  }).join(' ');
}

export function templateReply(f: ReplyFacts): string {
  const hello = `Hello${f.contact ? ` ${f.contact}` : f.clientName ? ` ${f.clientName}` : ''},`;
  const items = f.items.map((i) => `- ${i.qty} x ${i.sku}`).join('\n');
  const promise = f.promise
    ? `We can deliver by ${formatDate(f.promise.promiseDate)}.${f.promise.reason ? ` ${f.promise.reason}` : ''}`
    : '';
  if (f.decision === 'MISSING_INFO') {
    return `${hello}\n\nThank you for your order. We could not match it to your account or read the items. Could you reply with the SKU and quantity for each item?\n\nHalcyon Logistics`;
  }
  if (f.decision === 'CONFIRM_ADDRESS') {
    const options = f.candidates.length
      ? `\n\nIs it one of your saved addresses?\n${f.candidates.map((c) => `- ${addressLine(c)}`).join('\n')}`
      : '';
    const ask = f.missing.length
      ? `Before we ship, please send the ${missingLabels(f.missing).join(', ')} for the delivery address.`
      : `Before we ship, please check the delivery address you gave: ${f.address}. ${issueSentences(f)} `
        + `Please reply with the correct ${[...new Set(f.addressIssues.map((i) => ISSUE_LABEL[i]))].join(', ')}.`;
    return `${hello}\n\nThank you for your order:\n${items}\n\n${ask}${options}\n\n${promise}\n\nHalcyon Logistics`;
  }
  return `${hello}\n\nYour order is confirmed:\n${items}\n\n${promise}\n\nHalcyon Logistics`;
}

export const REPLY_SYSTEM = readFileSync(fileURLToPath(new URL('./prompts/reply.md', import.meta.url)), 'utf8');

/** E6: model drafts from checked facts; falls back to the template if it fails or drops a required phrase. */
export async function draftReply(llm: LLM, f: ReplyFacts): Promise<{ text: string; source: 'model' | 'template' }> {
  const required = requiredPhrases(f);
  try {
    const user = JSON.stringify({ decision: f.decision, client_name: f.clientName, contact: f.contact, items: f.items,
      promise: f.promise, missing: f.missing.length ? missingLabels(f.missing) : [], candidates: f.candidates,
      address: f.address, address_problem: f.addressIssues.length ? issueSentences(f) : null, required_phrases: required });
    const text = await llm.text({ system: REPLY_SYSTEM, user });
    if (text && required.every((p) => text.includes(p))) return { text, source: 'model' };
  } catch {
    // fall through to the template
  }
  return { text: templateReply(f), source: 'template' };
}
