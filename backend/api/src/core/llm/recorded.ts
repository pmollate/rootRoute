import { readRecording, RECORDINGS_DIR, writeRecording } from '../recordings.js';
import { type JsonRequest, type LLM, LLMError, parseJson, type TextRequest } from './types.js';

/** Replays responses saved by RecordingLLM. Used by tests and CI: fast, free, repeatable. */
export class RecordedLLM implements LLM {
  readonly name = 'recorded';
  constructor(private readonly dir = RECORDINGS_DIR) {}

  private read(kind: 'json' | 'text', system: string, user: string): string {
    const text = readRecording(this.dir, kind, system, user);
    if (text === null) throw new LLMError(`no ${kind} recording for this prompt in ${this.dir}`, 'missing_recording');
    return text;
  }

  async json<T>(req: JsonRequest<T>): Promise<T> {
    return parseJson(this.read('json', req.system, req.user), req.schema);
  }

  async text(req: TextRequest): Promise<string> {
    return this.read('text', req.system, req.user);
  }
}

/** Wraps a real model and saves every response so RecordedLLM can replay it (RECORD=1). */
export class RecordingLLM implements LLM {
  readonly name: string;
  constructor(private readonly inner: LLM, private readonly dir = RECORDINGS_DIR) {
    this.name = `${inner.name}+recording`;
  }

  async json<T>(req: JsonRequest<T>): Promise<T> {
    const out = await this.inner.json(req);
    writeRecording(this.dir, 'json', req.system, req.user, JSON.stringify(out));
    return out;
  }

  async text(req: TextRequest): Promise<string> {
    const out = await this.inner.text(req);
    writeRecording(this.dir, 'text', req.system, req.user, out);
    return out;
  }
}
