'use client';

import { type FormEvent, useState } from 'react';
import { Pill } from '@/components/dashboard/ui';
import { SESSION_ENDED, SessionExpired, postJSON } from '@/lib/api';
import s from './ask.module.css';

/** The API's reply (backend/api/src/modules/assistant/answer.ts, `AssistantAnswer`). */
export interface AssistantSource { tool: string; args: Record<string, unknown>; result: unknown }
export interface AssistantAnswer {
  questionId: string; answer: string; refused: boolean; checked: boolean; sources: AssistantSource[]; toolCalls: number; skipped: string[];
}
type Turn = { role: 'user'; text: string } | { role: 'assistant'; text: string; a: AssistantAnswer };

const MAX_QUESTION = 500; // SEC-ASK-01 (the API refuses longer with 400 too_long)
const MAX_HISTORY = 6;    // the API accepts at most 6 earlier turns

/** The API's error codes (routes.ts) as the operator reads them; no server text reaches the screen. */
function message(err: unknown): string {
  if (err instanceof SessionExpired) return SESSION_ENDED;
  if (err instanceof Error && err.message === 'rate_limited') return 'Too many questions in a minute. Try again shortly.';
  if (err instanceof Error && err.message === 'too_long') return `Questions can be at most ${MAX_QUESTION} characters.`;
  return 'Ask LateLens is not available right now.';
}

/**
 * D10 "Ask LateLens" (SPEC §5.16, owner C). The conversation lives only in this component's state: nothing in
 * localStorage or sessionStorage, gone on reload (SEC-ASK-03). Answers are plain React text, never HTML or Markdown,
 * so an answer cannot load a URL (SEC-ASK-06). Sources are the tools the API ran, as the API lists them (REQ-ASK-05).
 * Calls go through the same-origin proxy (`postJSON`), which adds the token or the shared key server-side.
 */
export function AskPanel() {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tooLong = question.length > MAX_QUESTION;

  async function ask(e: FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || q.length > MAX_QUESTION || busy) return;
    const history = turns.slice(-MAX_HISTORY).map((t) => ({ role: t.role, text: t.text }));
    setBusy(true);
    setError(null);
    setTurns((t) => [...t, { role: 'user', text: q }]);
    setQuestion('');
    try {
      const a = await postJSON<AssistantAnswer>('/api/assistant', { question: q, history });
      setTurns((t) => [...t, { role: 'assistant', text: a.answer, a }]);
    } catch (err) {
      // No answer: take the question back out of the conversation and back into the box, so nothing typed is lost.
      setTurns((t) => t.slice(0, -1));
      setQuestion(q);
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={s.dock}>
      <button type="button" className={s.toggle} aria-expanded={open} onClick={() => setOpen((o) => !o)}>Ask LateLens</button>
      {open && (
        <section className={s.panel} aria-label="Ask LateLens">
          <p className={s.hint}>Answers come from LateLens data through read-only tools. It never acts and never decides for Halcyon.</p>
          <ol className={s.turns}>
            {turns.map((t, i) => (
              <li key={i} className={t.role === 'user' ? s.user : s.answer}>
                <p className={s.text}>{t.text}</p>
                {t.role === 'assistant' && !t.a.refused && !t.a.checked && <Pill tone="warn">Figures not checked</Pill>}
                {t.role === 'assistant' && t.a.sources.length > 0 && (
                  <details className={s.sources}>
                    <summary>Sources ({t.a.sources.length})</summary>
                    <ul>
                      {t.a.sources.map((src, j) => (
                        <li key={j}>
                          <code>{src.tool}({JSON.stringify(src.args)})</code>
                          <pre className={s.result}>{JSON.stringify(src.result, null, 2)}</pre>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ol>
          {error && <p className={s.error} role="alert">{error}</p>}
          <form onSubmit={ask} className={s.form}>
            <label htmlFor="ask-q" className={s.label}>Your question</label>
            <textarea id="ask-q" value={question} maxLength={MAX_QUESTION} rows={2} onChange={(e) => setQuestion(e.target.value)} />
            <span className={s.count}>{question.length}/{MAX_QUESTION}</span>
            <button type="submit" disabled={busy || !question.trim() || tooLong}>{busy ? 'Asking…' : 'Ask'}</button>
          </form>
        </section>
      )}
    </div>
  );
}
