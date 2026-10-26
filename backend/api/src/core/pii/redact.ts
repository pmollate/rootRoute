import type { PiiCategory, PiiDetector, PiiEntity } from './types.js';

const TAG: Record<PiiCategory, string> = { Person: 'PERSON', PhoneNumber: 'PHONE', Email: 'EMAIL' };

export interface Redaction {
  text: string;                         // what the AI model sees
  replacements: Record<string, string>; // tag -> original value, e.g. "[PERSON_1]" -> "Dana Whitfield"
}

/** Replaces each entity with a numbered tag; the same value always gets the same tag. */
export function applyRedaction(text: string, entities: PiiEntity[]): Redaction {
  const sorted = [...entities].sort((a, b) => a.offset - b.offset);
  const tagOf = new Map<string, string>();
  const counts: Partial<Record<PiiCategory, number>> = {};
  const replacements: Record<string, string> = {};
  for (const e of sorted) {
    const key = `${e.category}:${e.text}`;
    if (tagOf.has(key)) continue;
    counts[e.category] = (counts[e.category] ?? 0) + 1;
    const tag = `[${TAG[e.category]}_${counts[e.category]}]`;
    tagOf.set(key, tag);
    replacements[tag] = e.text;
  }
  let out = '';
  let pos = 0;
  const misaligned: PiiEntity[] = [];
  for (const e of sorted) {
    if (e.offset < pos || text.slice(e.offset, e.offset + e.length) !== e.text) {
      misaligned.push(e);
      continue;
    }
    out += text.slice(pos, e.offset) + tagOf.get(`${e.category}:${e.text}`);
    pos = e.offset + e.length;
  }
  out += text.slice(pos);
  // Fail closed: an entity whose offset does not line up is still removed wherever its text appears.
  for (const e of misaligned) out = out.split(e.text).join(tagOf.get(`${e.category}:${e.text}`));
  return { text: out, replacements };
}

export async function redact(detector: PiiDetector, text: string): Promise<Redaction> {
  return applyRedaction(text, await detector.detect(text));
}

/** Puts the original values back, e.g. into an approved reply before it is sent. */
export function restore(text: string, replacements: Record<string, string>): string {
  return Object.entries(replacements).reduce((out, [tag, value]) => out.split(tag).join(value), text);
}
