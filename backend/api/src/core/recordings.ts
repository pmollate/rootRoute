import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Saved responses from the AI and map services, replayed in tests and CI (LLM_PROVIDER / PII_PROVIDER / ADDRESS_PROVIDER = recorded). */
export const RECORDINGS_DIR = fileURLToPath(new URL('../../test/recordings/', import.meta.url));

export type RecordingKind = 'json' | 'text' | 'pii' | 'address';

export function recordingKey(kind: RecordingKind, system: string, user: string): string {
  return createHash('sha256').update(JSON.stringify({ kind, system, user })).digest('hex').slice(0, 32);
}

/** A saved failure the service gave as its answer (e.g. a refusal), replayed as the same error. */
export interface RecordedError {
  kind: string;
  message: string;
}

interface Entry {
  kind: RecordingKind;
  text: string;
  error?: RecordedError;
}

function readEntry(dir: string, kind: RecordingKind, system: string, user: string): Entry | null {
  const file = join(dir, `${recordingKey(kind, system, user)}.json`);
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Entry) : null;
}

/** The saved response, or null when there is none (or when the saved answer was an error). */
export function readRecording(dir: string, kind: RecordingKind, system: string, user: string): string | null {
  const entry = readEntry(dir, kind, system, user);
  return entry && !entry.error ? entry.text : null;
}

/** The saved error for this prompt, if its recorded answer was one. */
export function readRecordedError(dir: string, kind: RecordingKind, system: string, user: string): RecordedError | null {
  return readEntry(dir, kind, system, user)?.error ?? null;
}

export function writeRecording(dir: string, kind: RecordingKind, system: string, user: string, text: string,
  error?: RecordedError): void {
  mkdirSync(dir, { recursive: true });
  const entry: Entry = error ? { kind, text, error } : { kind, text };
  writeFileSync(join(dir, `${recordingKey(kind, system, user)}.json`), JSON.stringify(entry, null, 2));
}
