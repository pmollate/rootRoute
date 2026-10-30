'use client';

import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { AskAnswer, AskErrorNote } from './AskAnswer';
import { MAX_QUESTION, useAsk } from './useAsk';
import s from './ask.module.css';

export type { AssistantAnswer, AssistantSource } from './useAsk';

/**
 * D10 "Ask LateLens" (SPEC §5.16, owner C): the dock on every dashboard screen except Overview, where Router answers.
 * The conversation is `useAsk`'s component state only (SEC-ASK-03); answers render through `AskAnswer` as plain text
 * (SEC-ASK-06). Calls go through the same-origin proxy, which adds the token or the shared key server-side.
 * Focus moves to the question box on open; Escape closes and returns focus to the toggle; Enter sends, Shift+Enter
 * adds a line.
 */
export function AskPanel() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const { exchanges, busy, error, ask } = useAsk();
  const toggle = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const tooLong = question.length > MAX_QUESTION;

  useEffect(() => {
    if (!open) return;
    box.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      toggle.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || tooLong || busy) return;
    setQuestion('');
    // No answer: the question goes back into the box, so nothing typed is lost (REQ-AUTH-11).
    if (!(await ask(q))) setQuestion(q);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    e.currentTarget.form?.requestSubmit();
  }

  return (
    <div className={s.dock}>
      <button ref={toggle} type="button" className={s.toggle} aria-expanded={open} aria-controls="ask-root-route"
        onClick={() => setOpen((o) => !o)}>Ask Root Route</button>
      {open && (
        <section id="ask-root-route" className={s.panel} aria-label="Ask Root Route">
          <p className={s.hint}>Answers come from Root Route data through read-only tools. It never acts and never decides for Halcyon.</p>
          <ol className={s.turns} aria-live="polite" aria-busy={busy}>
            {exchanges.flatMap((x, i) => [
              <li key={`q${i}`} className={s.user}><p className={s.text}>{x.question}</p></li>,
              ...(x.answer ? [<li key={`a${i}`} className={s.answer}><AskAnswer a={x.answer} /></li>] : []),
            ])}
          </ol>
          {error && <AskErrorNote error={error} />}
          <form onSubmit={submit} className={s.form}>
            <label htmlFor="ask-q" className={s.label}>Your question</label>
            <textarea ref={box} id="ask-q" value={question} maxLength={MAX_QUESTION} rows={2} aria-describedby="ask-count"
              onChange={(e) => setQuestion(e.target.value)} onKeyDown={onKeyDown} />
            <span id="ask-count" className={s.count}>{question.length}/{MAX_QUESTION}</span>
            <button type="submit" disabled={busy || !question.trim() || tooLong}>{busy ? 'Asking…' : 'Ask'}</button>
          </form>
        </section>
      )}
    </div>
  );
}
