import { readRecording, RECORDINGS_DIR, writeRecording } from '../recordings.js';
import { type PiiDetector, type PiiEntity, PiiError } from './types.js';

/** Replays entities saved by RecordingPii. Used by tests and CI. */
export class RecordedPii implements PiiDetector {
  readonly name = 'recorded';
  constructor(private readonly dir = RECORDINGS_DIR) {}

  async detect(text: string): Promise<PiiEntity[]> {
    const saved = readRecording(this.dir, 'pii', '', text);
    if (saved === null) throw new PiiError(`no pii recording for this text in ${this.dir}`, 'missing_recording');
    return JSON.parse(saved) as PiiEntity[];
  }
}

/** Wraps a real detector and saves every result so RecordedPii can replay it (RECORD=1). */
export class RecordingPii implements PiiDetector {
  readonly name: string;
  constructor(private readonly inner: PiiDetector, private readonly dir = RECORDINGS_DIR) {
    this.name = `${inner.name}+recording`;
  }

  async detect(text: string): Promise<PiiEntity[]> {
    const out = await this.inner.detect(text);
    writeRecording(this.dir, 'pii', '', text, JSON.stringify(out));
    return out;
  }
}
