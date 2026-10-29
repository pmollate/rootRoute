import { readRecordedError, readRecording, RECORDINGS_DIR, writeRecording } from '../recordings.js';
import {
  type JsonRequest, type LLM, LLMError, type LLMErrorKind, parseJson, type TextRequest, type ToolChatLLM, type ToolChatRequest, type ToolChatTurn,
} from './types.js';

/** The recording key of one assistant turn: the whole conversation so far and the tools offered (D10, REQ-ASK-10). */
export const toolChatKey = (req: ToolChatRequest) => JSON.stringify({ messages: req.messages, tools: req.tools });

/** Replays responses saved by RecordingLLM. Used by tests and CI: fast, free, repeatable. */
export class RecordedLLM implements ToolChatLLM {
  readonly name = 'recorded';
  constructor(private readonly dir = RECORDINGS_DIR) {}

  private read(kind: 'json' | 'text' | 'tool', system: string, user: string): string {
    const error = readRecordedError(this.dir, kind, system, user);
    if (error) throw new LLMError(error.message, error.kind as LLMErrorKind);
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

  async toolChat(req: ToolChatRequest): Promise<ToolChatTurn> {
    return JSON.parse(this.read('tool', req.system, toolChatKey(req))) as ToolChatTurn;
  }
}

/** Wraps a real model and saves every response so RecordedLLM can replay it (RECORD=1). */
export class RecordingLLM implements ToolChatLLM {
  readonly name: string;
  constructor(private readonly inner: LLM | ToolChatLLM, private readonly dir = RECORDINGS_DIR) {
    this.name = `${inner.name}+recording`;
  }

  async json<T>(req: JsonRequest<T>): Promise<T> {
    const out = await this.saveErrors('json', req, () => this.inner.json(req));
    writeRecording(this.dir, 'json', req.system, req.user, JSON.stringify(out));
    return out;
  }

  async text(req: TextRequest): Promise<string> {
    const out = await this.saveErrors('text', req, () => this.inner.text(req));
    writeRecording(this.dir, 'text', req.system, req.user, out);
    return out;
  }

  async toolChat(req: ToolChatRequest): Promise<ToolChatTurn> {
    const inner = this.inner;
    if (!('toolChat' in inner)) throw new LLMError(`${inner.name} has no toolChat`, 'transport');
    const out = await this.saveErrors('tool', { system: req.system, user: toolChatKey(req) }, () => inner.toolChat(req));
    writeRecording(this.dir, 'tool', req.system, toolChatKey(req), JSON.stringify(out));
    return out;
  }

  /** A refusal or invalid output is the model's answer and is replayed; a transport error is not saved. */
  private async saveErrors<T>(kind: 'json' | 'text' | 'tool', req: TextRequest, call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (err) {
      if (err instanceof LLMError && (err.kind === 'refusal' || err.kind === 'invalid')) {
        writeRecording(this.dir, kind, req.system, req.user, '', { kind: err.kind, message: err.message });
      }
      throw err;
    }
  }
}
