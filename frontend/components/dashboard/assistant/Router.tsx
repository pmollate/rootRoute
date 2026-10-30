'use client';

import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { AskAnswer, AskErrorNote } from './AskAnswer';
import { MAX_QUESTION, useAsk } from './useAsk';
import r from './router.module.css';

/** The Router mark: a large and a small sparkle, filled with the current text colour. */
export const BotIcon = () => (
  <svg className={r.botIcon} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M10 3c.4 3.9 2.6 6.1 6.5 6.5-3.9.4-6.1 2.6-6.5 6.5-.4-3.9-2.6-6.1-6.5-6.5C7.4 9.1 9.6 6.9 10 3Z" />
    <path d="M18 13.5c.2 2 1.3 3.1 3.3 3.3-2 .2-3.1 1.3-3.3 3.3-.2-2-1.3-3.1-3.3-3.3 2-.2 3.1-1.3 3.3-3.3Z" />
  </svg>
);

const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);

/**
 * Router's frame (D10, SPEC §5.16): the floating icon, the scrim and the side popup with its header. `children` is the
 * thread and the question box. Focus moves to the question box on open; Escape, the scrim or the close button shut it
 * and focus returns to the icon.
 */
export function RouterFrame({ subtitle, children }: { subtitle?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const close = () => { setOpen(false); launcher.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector('input')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); launcher.current?.focus(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button ref={launcher} type="button" className={`${r.bot} ${r.launcher}`} aria-expanded={open} aria-controls="assistant" aria-label="Open Router"
        onClick={() => setOpen(true)}>
        <BotIcon /><i /><span className={r.launcherTip} aria-hidden="true">Ask Router</span>
      </button>
      <div className={r.scrim} data-open={open} aria-hidden="true" onClick={close} />
      <section ref={panel} id="assistant" className={r.assistant} data-open={open} aria-label="Router">
        <div className={r.chatHead}>
          <span className={r.bot}><BotIcon /><i /></span>
          <div><b>Router</b>{subtitle != null && <small>{subtitle}</small>}</div>
          <button type="button" className={r.close} aria-label="Close assistant" onClick={close}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        {children}
      </section>
    </>
  );
}

/** One reply bubble with the small Router mark. */
export const Reply = ({ children }: { children: ReactNode }) => (
  <div className={r.reply}><span className={r.botSmall}><BotIcon /></span><div className={r.replyBody}>{children}</div></div>
);

/** The question box at the foot of the popup. */
export function RouterInput({ value, onChange, onSubmit, disabled, maxLength }: {
  value: string; onChange: (v: string) => void; onSubmit: (e: FormEvent) => void; disabled: boolean; maxLength?: number;
}) {
  return (
    <form className={r.ask} onSubmit={onSubmit}>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Ask a follow-up about delivery performance…" aria-label="Ask a follow-up"
        maxLength={maxLength} />
      <button type="submit" aria-label="Send" disabled={disabled}><SendIcon /></button>
    </form>
  );
}

/**
 * Router on every dashboard screen but Overview (whose Router also walks through the fix plan). The conversation is
 * `useAsk`'s component state only (SEC-ASK-03); answers render through `AskAnswer` as plain text (SEC-ASK-06). Calls go
 * through the same-origin proxy, which adds the token or the shared key server-side.
 */
export function RouterDock() {
  const [draft, setDraft] = useState('');
  const { exchanges, busy, error, ask } = useAsk();
  const tooLong = draft.trim().length > MAX_QUESTION;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const q = draft.trim();
    if (!q || tooLong || busy) return;
    setDraft('');
    // No answer: the question goes back into the box, so nothing typed is lost (REQ-AUTH-11).
    if (!(await ask(q))) setDraft(q);
  }

  return (
    <RouterFrame subtitle="Answers from Root Route data">
      <div className={r.thread} aria-live="polite" aria-busy={busy}>
        <Reply>
          <p>Ask me about late-delivery causes, the replay, carrier lanes, a carrier recommendation or a delivery promise. I answer from
            Root Route data through read-only tools; I never act and never decide for Halcyon.</p>
        </Reply>
        {exchanges.map((x, i) => (
          <div key={i}>
            <p className={r.you}>{x.question}</p>
            <Reply>{x.answer ? <AskAnswer a={x.answer} /> : <p>Asking Router…</p>}</Reply>
          </div>
        ))}
      </div>
      {error && <div className={r.note}><AskErrorNote error={error} /></div>}
      <RouterInput value={draft} onChange={setDraft} onSubmit={submit} disabled={busy || !draft.trim() || tooLong} maxLength={MAX_QUESTION} />
    </RouterFrame>
  );
}
