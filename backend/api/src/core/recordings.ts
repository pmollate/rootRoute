import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Saved responses from the AI services, replayed in tests and CI (LLM_PROVIDER / PII_PROVIDER = recorded). */
export const RECORDINGS_DIR = fileURLToPath(new URL('../../test/recordings/', import.meta.url));

export type RecordingKind = 'json' | 'text' | 'pii';

export function recordingKey(kind: RecordingKind, system: string, user: string): string {
  return createHash('sha256').update(JSON.stringify({ kind, system, user })).digest('hex').slice(0, 32);
}

/** The saved response, or null when there is none. */
export function readRecording(dir: string, kind: RecordingKind, system: string, user: string): string | null {
  const file = join(dir, `${recordingKey(kind, system, user)}.json`);
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as { text: string }).text : null;
}

export function writeRecording(dir: string, kind: RecordingKind, system: string, user: string, text: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${recordingKey(kind, system, user)}.json`), JSON.stringify({ kind, text }, null, 2));
}
