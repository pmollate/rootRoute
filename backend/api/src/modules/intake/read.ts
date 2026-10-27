import type { LLM } from '../../core/llm/types.js';
import type { AddressValidator } from '../../core/maps/types.js';
import { redact } from '../../core/pii/redact.js';
import type { PiiDetector } from '../../core/pii/types.js';
import { type AddressCheck, checkAddress, splitUnit, verifyAddress } from './address.js';
import { type Decision, decide } from './decide.js';
import { extractOrder } from './extract.js';
import type { Extraction, SavedAddress } from './schema.js';

export interface IntakeDeps {
  llm: LLM;
  pii: PiiDetector;
  maps: AddressValidator;
}

export interface RedactedEmail {
  subject: string;
  body: string;
  replacements: Record<string, string>; // tag -> original value; restore() only after the operator approves a reply
}

export interface OrderReading {
  redacted: RedactedEmail;
  extraction: Extraction | null;
  address: AddressCheck | null;
  decision: Decision;
}

/** Subject and body in one PII call (the subject can name a person too). */
export async function redactEmail(pii: PiiDetector, subject: string, body: string): Promise<RedactedEmail> {
  const r = await redact(pii, `${subject}\n\n${body}`);
  const cut = r.text.indexOf('\n\n');
  return { subject: r.text.slice(0, cut), body: r.text.slice(cut + 2), replacements: r.replacements };
}

/** A client's answer to our reply: what the first email already told us, and the (redacted) text it came from. */
export interface EarlierEmail {
  extraction: Extraction | null;
  source: string;
}

/** For a client's reply, keep what the first email already told us and fill gaps from the reply. */
export function mergeExtraction(base: Extraction | null, next: Extraction | null): Extraction | null {
  if (!base) return next;
  if (!next) return base;
  const a = { ...base.address };
  for (const k of ['line1', 'line2', 'city', 'state', 'zip'] as const) a[k] = next.address[k] ?? base.address[k];
  return {
    items: next.items.length ? next.items : base.items,
    address: { ...a, raw: [base.address.raw, next.address.raw].filter(Boolean).join(' | ') || null },
    requested_commitment: next.requested_commitment ?? base.requested_commitment,
    confidence: next.confidence,
  };
}

/**
 * E3-E5 for one email: redact -> extract -> ground and check the address -> map -> decide.
 * The model and the grounding both see only the redacted text. A PiiError is thrown: no redaction, no model call.
 * With `earlier`, the email is a client's reply: its facts are merged into the first email's and grounded in both.
 */
export async function readOrder(deps: IntakeDeps, email: { subject: string; body: string }, clientId: string | null,
  saved: SavedAddress[], earlier?: EarlierEmail): Promise<OrderReading> {
  const redacted = await redactEmail(deps.pii, email.subject, email.body);
  const raw = await extractOrder(deps.llm, redacted.subject, redacted.body);
  // The model sometimes puts "Dock 6" in the street line: fix it once here, so storage and the merge see it too.
  const own = raw && { ...raw, address: splitUnit(raw.address) };
  const extraction = earlier ? mergeExtraction(earlier.extraction, own) : own;
  const source = `${earlier ? `${earlier.source}\n` : ''}${redacted.subject}\n${redacted.body}`;
  const address = extraction ? await verifyAddress(checkAddress(extraction.address, saved, source), saved, deps.maps) : null;
  return { redacted, extraction, address, decision: decide(clientId, extraction, address) };
}
