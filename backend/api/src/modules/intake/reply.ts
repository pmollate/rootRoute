import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { PromiseResult } from '../../core/contracts.js';
import type { LLM, TextRequest } from '../../core/llm/types.js';
import type { AddressQuery } from '../../core/maps/types.js';
import type { AddressCheck } from './address.js';
import type { Decision } from './decide.js';
import { LINK_PLACEHOLDER, neutralisePlaceholder as clean } from './linkRules.js';
import type { Extraction } from './schema.js';
import type { AddressIssue } from './validate.js';

/** Checked facts only: the model never sees the raw email when drafting (SEC-02). Names stay as tags (SEC-05). */
export interface ReplyFacts {
  decision: Decision;
  clientName: string | null;
  contact: string | null;          // a PII tag such as [PERSON_1]; restore() fills it in after approval
  items: { sku: string; qty: number }[];
  promise: PromiseResult | null;
  missing: string[];               // e.g. ["address.line1", "address.zip"]
  address: string | null;          // the address as given, when the map could not confirm it
  addressIssues: AddressIssue[];
  suggestion: AddressQuery | null; // the map's reading (never a different street)
  link?: boolean;                  // E19 CONFIRM_LINK=on: a CONFIRM_ADDRESS reply carries [CONFIRM_LINK] (REQ-LINK-01)
  deliverTo?: string;              // E19: the address the client confirmed through the link, repeated in the acceptance
}

export const formatAddress = (a: NonNullable<AddressCheck['address']>) =>
  `${a.line1}${a.line2 ? `, ${a.line2}` : ''}, ${a.city}, ${a.state} ${a.zip}`;

/**
 * The checked facts a reply is drafted from, built one way for the pipeline, the flag-off fallback at send time and the
 * E19 decision again. `piiMap` is the tag -> value map of the email (only its first [PERSON_n] tag is used).
 */
export function replyFactsOf(f: { decision: Decision; clientName: string | null; piiMap: Record<string, string>;
  extraction: Extraction | null; address: AddressCheck | null; promise: PromiseResult | null; link?: boolean }): ReplyFacts {
  const { address } = f;
  const unverified = address?.status === 'unverified';
  const suggestion = unverified ? address.validation?.suggestion ?? null : null;
  // Every value from the email (or a client-confirmed saved address) has [CONFIRM_LINK] removed (SEC-02, REQ-LINK-09).
  return {
    decision: f.decision, clientName: f.clientName,
    contact: Object.keys(f.piiMap).find((tag) => tag.startsWith('[PERSON_')) ?? null,
    items: (f.extraction?.items ?? []).map((i) => ({ ...i, sku: clean(i.sku) })), promise: f.promise, missing: address?.missing ?? [],
    address: unverified && address.address ? clean(formatAddress(address.address)) : null,
    addressIssues: unverified ? address.validation?.issues ?? [] : [],
    suggestion: suggestion && { ...suggestion, line1: clean(suggestion.line1), city: clean(suggestion.city), state: clean(suggestion.state), zip: clean(suggestion.zip) },
    ...(f.link ? { link: true } : {}),
    ...(address?.status === 'confirmed' && address.address ? { deliverTo: clean(formatAddress(address.address)) } : {}),
  };
}

/** The email's names (tag -> value) with [CONFIRM_LINK] removed, for putting names back into a reply (SEC-02). */
export function safeNames(piiMap: Record<string, string> | null): Record<string, string> {
  return Object.fromEntries(Object.entries(piiMap ?? {}).map(([tag, value]) => [tag, clean(value)]));
}

const FIELD_LABEL: Record<string, string> = {
  'address.line1': 'street address', 'address.city': 'city', 'address.state': 'state', 'address.zip': 'ZIP code',
};
const ISSUE_LABEL: Record<AddressIssue, string> = { street_not_found: 'street address', city_mismatch: 'city', zip_mismatch: 'ZIP code', state_mismatch: 'state' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function missingLabels(missing: string[]): string[] {
  return missing.map((m) => FIELD_LABEL[m] ?? m);
}

/** Strings that must appear verbatim in any reply for these facts. */
export function requiredPhrases(f: ReplyFacts): string[] {
  const out: string[] = [];
  if (f.promise) out.push(formatDate(f.promise.promiseDate));
  if (f.decision === 'CONFIRM_ADDRESS') {
    out.push(...missingLabels(f.missing), ...f.addressIssues.map((i) => ISSUE_LABEL[i]));
    if (f.addressIssues.includes('zip_mismatch') && f.suggestion) out.push(f.suggestion.zip);
    if (f.addressIssues.includes('city_mismatch') && f.suggestion) out.push(f.suggestion.city);
    if (f.link) out.push(LINK_PLACEHOLDER); // a model draft without it falls back to the template
  }
  if (f.decision === 'ALL_CLEAR' && f.deliverTo) out.push(f.deliverTo); // the client checks the address they confirmed
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
    if (issue === 'city_mismatch') return `The map places ${street}, ${state} ${zip} in ${s ? s.city : 'another city'}, not ${city}.`;
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
    // 31 Oct (the user): ask for the updated address; saved addresses are never listed in a reply (REQ-INT-06).
    const ask = f.missing.length
      ? `Before we ship, we need the ${missingLabels(f.missing).join(', ')} for the delivery address. Please reply with the full, correct delivery address.`
      : `Before we ship, please check the delivery address you gave: ${f.address}. `
        + `${issueSentences(f) || 'We could not confirm it on the map.'} Please check the `
        + `${f.addressIssues.length ? [...new Set(f.addressIssues.map((i) => ISSUE_LABEL[i]))].join(', ') : 'street address and ZIP code'}`
        + ' and reply with the full, correct delivery address.';
    const link = f.link ? `\n\nYou can also update the address with this one-time link: ${LINK_PLACEHOLDER}` : '';
    return `${hello}\n\nThank you for your order:\n${items}\n\n${ask}${link}\n\n${promise}\n\nHalcyon Logistics`;
  }
  const deliverTo = f.deliverTo ? `We will deliver to the address you confirmed: ${f.deliverTo}.\n\n` : '';
  return `${hello}\n\nYour order is confirmed:\n${items}\n\n${deliverTo}${promise}\n\nHalcyon Logistics`;
}

export const REPLY_SYSTEM = readFileSync(fileURLToPath(new URL('./prompts/reply.md', import.meta.url)), 'utf8');

/** The model request for a reply: the checked facts only (SEC-02). The reply eval sends the same request. */
export function replyRequest(f: ReplyFacts): TextRequest {
  const user = JSON.stringify({ decision: f.decision, client_name: f.clientName, contact: f.contact, items: f.items,
    promise: f.promise, missing: f.missing.length ? missingLabels(f.missing) : [],
    address: f.address, address_problem: f.addressIssues.length ? issueSentences(f) : null,
    // only after a link confirmation, so the recorded E7 requests (no deliver_to) are unchanged
    ...(f.deliverTo ? { deliver_to: f.deliverTo } : {}), required_phrases: requiredPhrases(f) });
  return { system: REPLY_SYSTEM, user, tag: 'reply' };
}

/** E6: model drafts from checked facts; falls back to the template if it fails or drops a required phrase. */
export async function draftReply(llm: LLM, f: ReplyFacts): Promise<{ text: string; source: 'model' | 'template' }> {
  const required = requiredPhrases(f);
  try {
    const text = await llm.text(replyRequest(f));
    if (text && required.every((p) => text.includes(p))) return { text, source: 'model' };
  } catch {
    // fall through to the template
  }
  return { text: templateReply(f), source: 'template' };
}

/**
 * REQ-LINK-09: with CONFIRM_LINK off (or no link to mint) a reply drafted with [CONFIRM_LINK] never sends it as text.
 * Only the sentence holding the placeholder is removed (sentences end at . ! or ? and a space, or at the line's end);
 * a line left empty goes too, with the blank line it leaves doubled. The caller re-checks the required phrases.
 */
export function withoutLinkPlaceholder(text: string): string {
  if (!text.includes(LINK_PLACEHOLDER)) return text;
  const lines = text.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].includes(LINK_PLACEHOLDER)) { out.push(lines[i]); continue; }
    const kept = withoutPlaceholderSentences(lines[i]);
    if (kept.trim()) { out.push(kept); continue; }
    if (out.length && out.at(-1)!.trim() === '' && (lines[i + 1] ?? '').trim() === '') i += 1;
  }
  return out.join('\n');
}

function withoutPlaceholderSentences(line: string): string {
  let out = line;
  for (let at = out.indexOf(LINK_PLACEHOLDER); at >= 0; at = out.indexOf(LINK_PLACEHOLDER)) {
    let start = 0;
    for (const m of out.slice(0, at).matchAll(/[.!?]\s+/g)) start = m.index + m[0].length;
    const after = at + LINK_PLACEHOLDER.length;
    const end = /^.*?[.!?](?:\s+|$)/.exec(out.slice(after));
    const prefix = out.slice(0, start);
    const suffix = end ? out.slice(after + end[0].length) : '';
    out = suffix ? prefix + suffix : prefix.trimEnd();
  }
  return out;
}
