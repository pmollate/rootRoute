import type { LLM } from '../../core/llm/types.js';
import type { AddressValidator } from '../../core/maps/types.js';
import { redact } from '../../core/pii/redact.js';
import type { PiiDetector } from '../../core/pii/types.js';
import { type AddressCheck, checkAddress, verifyAddress } from './address.js';
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

/**
 * E3-E5 for one email: redact -> extract -> ground and check the address -> map -> decide.
 * The model and the grounding both see only the redacted text. A PiiError is thrown: no redaction, no model call.
 */
export async function readOrder(deps: IntakeDeps, email: { subject: string; body: string }, clientId: string | null,
  saved: SavedAddress[]): Promise<OrderReading> {
  const redacted = await redactEmail(deps.pii, email.subject, email.body);
  const extraction = await extractOrder(deps.llm, redacted.subject, redacted.body);
  const address = extraction
    ? await verifyAddress(checkAddress(extraction.address, saved, `${redacted.subject}\n${redacted.body}`), saved, deps.maps)
    : null;
  return { redacted, extraction, address, decision: decide(clientId, extraction, address) };
}
