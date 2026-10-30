'use client';

import { type ClipboardEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { SyntheticBadge } from '@/components/dashboard/ui';
import { ConfirmScreen, type LinkView } from './ConfirmScreen';
import s from './confirm.module.css';
import { LINK_INVALID_TEXT } from './text';

/**
 * CONTRACTS (E19, REQ-LINK-17): what `GET /api/confirm/:token` returns with CONFIRM_LINK_CODE on and no valid
 * x-link-verify header: the masked sender, the link's expiry and the synthetic flag. Nothing about the address or order.
 */
export interface VerifyView { verify: { sentTo: string }; expiresAt: string; synthetic: boolean }

// Design settings, as the API's (linkRules.ts): a code's life and the wrong entries that lock it.
const CODE_SECONDS = 10 * 60;
const MAX_TRIES = 5;
const DIGITS = 6;

const until = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const clock = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
const json = { 'content-type': 'application/json' };

type Phase =
  | { kind: 'verify' }
  | { kind: 'address'; view: LinkView; verifyToken: string }
  | { kind: 'invalid' };

const STEPS = ['Verify email', 'Confirm address', 'Done'];

/** Where the client is: step 1 (verify) now; the address page and the thank-you follow. */
function Stepper() {
  return (
    <ol className={s.stepper} aria-label="Steps">
      {STEPS.map((label, i) => (
        <li key={label} className={i === 0 ? s.stepNow : s.step} aria-current={i === 0 ? 'step' : undefined}>
          <span className={s.stepDot} aria-hidden="true">{i + 1}</span>
          <span>{label}</span>
        </li>
      ))}
    </ol>
  );
}

/** The code's remaining life as a ring and mm:ss; a full ring before a code is sent. */
function Countdown({ left }: { left: number | null }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const share = left === null ? 1 : left / CODE_SECONDS;
  return (
    <div className={s.ring} role="timer" aria-label={left === null ? 'No code sent yet' : `Code expires in ${clock(left)}`}>
      <svg viewBox="0 0 80 80" aria-hidden="true">
        <circle cx="40" cy="40" r={r} className={s.ringTrack} />
        <circle cx="40" cy="40" r={r} className={s.ringLeft} strokeDasharray={c} strokeDashoffset={c * (1 - share)} />
      </svg>
      <span>{clock(left ?? CODE_SECONDS)}</span>
    </div>
  );
}

/**
 * E19 (SPEC §5.17 "Verification code", REQ-LINK-17 to -19): the "Check your inbox" step before the address page. Shows
 * only the masked sender (read-only: the code goes to the address the order came from, never one the visitor types)
 * and the link's expiry. **Send code** (a POST, never on page load: mail scanners open links) emails a 6-digit code;
 * the right code returns a verification token, held here in memory only, with which the page fetches the address and
 * shows ConfirmScreen. A 401 verify_required there comes back to this step.
 */
export function VerifyStep({ token, view }: { token: string; view: VerifyView }) {
  const base = `/api/confirm/${encodeURIComponent(token)}`;
  const [phase, setPhase] = useState<Phase>({ kind: 'verify' });
  const [digits, setDigits] = useState<string[]>(() => Array(DIGITS).fill(''));
  const code = digits.join('');
  const clear = () => setDigits(Array(DIGITS).fill(''));
  const [sentAt, setSentAt] = useState<number | null>(null); // when the current code was sent (ms)
  const [now, setNow] = useState(() => Date.now());
  const [wait, setWait] = useState(0);          // seconds until another code may be sent
  const [noMore, setNoMore] = useState(false);  // the link's codes are used up
  const [triesLeft, setTriesLeft] = useState(MAX_TRIES);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  // Formatted after hydration, in the reader's locale and zone (as ConfirmScreen does).
  const [expires, setExpires] = useState<string | null>(null);
  useEffect(() => { setExpires(until(view.expiresAt)); }, [view.expiresAt]);
  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  // The ring's clock: ticks once a second while a code is alive.
  const left = sentAt === null ? null : Math.max(0, CODE_SECONDS - Math.floor((now - sentAt) / 1000));
  useEffect(() => {
    if (left === null || left <= 0) return undefined;
    const t = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(t);
  }, [left, now]);

  async function sendCode() {
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch(`${base}/code`, { method: 'POST', headers: json, cache: 'no-store', body: '{}' });
      if (r.status === 200) {
        const b = (await r.json()) as { sentTo: string; retryIn: number };
        const t = Date.now();
        setSentAt(t);
        setNow(t);
        setWait(b.retryIn);
        setTriesLeft(MAX_TRIES);
        clear();
        boxes.current[0]?.focus();
      } else if (r.status === 404) setPhase({ kind: 'invalid' });
      else if (r.status === 429) {
        const b = (await r.json()) as { retryIn: number | null };
        if (b.retryIn === null) {
          setNoMore(true);
          setNote('No more codes can be sent for this link. Please reply to our email with the delivery address.');
        } else setWait(b.retryIn);
      } else if (r.status === 503) setNote('We could not send the code just now. Please try again in a minute.');
      else setNote('Something went wrong. Please try again.');
    } catch {
      setNote('Could not reach us. Please check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch(`${base}/verify`, { method: 'POST', headers: json, cache: 'no-store', body: JSON.stringify({ code }) });
      if (r.status === 200) {
        const { verifyToken } = (await r.json()) as { verifyToken: string };
        const g = await fetch(base, { headers: { accept: 'application/json', 'x-link-verify': verifyToken }, cache: 'no-store' });
        if (g.status === 404) { setPhase({ kind: 'invalid' }); return; }
        const v = (await g.json()) as LinkView | VerifyView;
        if (g.status !== 200 || 'verify' in v) { setNote('Something went wrong. Please try again.'); return; }
        setPhase({ kind: 'address', view: v, verifyToken });
      } else if (r.status === 404) setPhase({ kind: 'invalid' });
      else if (r.status === 422) {
        const b = (await r.json()) as { error: 'code_wrong'; triesLeft: number } | { error: 'code_expired' };
        if (b.error === 'code_wrong') setTriesLeft(b.triesLeft);
        else setTriesLeft(0);
        if (b.error === 'code_wrong' && b.triesLeft > 0) {
          setNote(`That code is not right. ${b.triesLeft} ${b.triesLeft === 1 ? 'try' : 'tries'} left.`);
        } else if (b.error === 'code_wrong') setNote('That code is not right. Send a new code.');
        else setNote('That code has expired. Send a new one.');
      } else if (r.status === 400) setNote('Please enter the 6 digits from the email.');
      else setNote('Something went wrong. Please try again.');
    } catch {
      setNote('Could not reach us. Please check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  /** Typing, autofill or a paste into box `i`: digits only, spread from that box on; focus moves past the last one. */
  function enter(i: number, value: string) {
    const typed = value.replace(/\D/g, '').slice(0, DIGITS - i).split('');
    setDigits((d) => { const n = [...d]; if (!typed.length) n[i] = ''; typed.forEach((x, k) => { n[i + k] = x; }); return n; });
    if (typed.length) boxes.current[Math.min(i + typed.length, DIGITS - 1)]?.focus();
  }
  /** A box's new text: one new digit typed beside the one it held ("4" then "7" gives "47") is just the new digit; a
   *  longer value is a paste or autofill of the code and is used as it is. */
  const typedInto = (held: string, value: string) => {
    const v = value.replace(/\D/g, '');
    return held && v.length === 2 && v.includes(held) ? v.replace(held, '') : v;
  };
  function key(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      e.preventDefault();
      enter(i - 1, '');
      boxes.current[i - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && i > 0) boxes.current[i - 1]?.focus();
    else if (e.key === 'ArrowRight' && i < DIGITS - 1) boxes.current[i + 1]?.focus();
  }
  function paste(i: number, e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    enter(i, e.clipboardData.getData('text'));
  }

  if (phase.kind === 'invalid') return <main className={s.page}><p className={s.message}>{LINK_INVALID_TEXT}</p></main>;
  if (phase.kind === 'address') {
    return <ConfirmScreen token={token} view={phase.view} verifyToken={phase.verifyToken}
      onVerifyRequired={() => { clear(); setNote(null); setPhase({ kind: 'verify' }); }} />;
  }

  const filled = digits.filter(Boolean).length;
  const complete = filled === DIGITS;
  const sendLabel = sentAt === null ? 'Send code' : wait > 0 ? `Resend in ${clock(wait)}` : 'Resend code';
  const box = (i: number) => (
    <input key={i} ref={(el) => { boxes.current[i] = el; }} className={s.digit} aria-label={`Digit ${i + 1} of ${DIGITS}`}
      inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={i === 0 ? DIGITS : 1}
      value={digits[i]} onChange={(e) => enter(i, typedInto(digits[i], e.target.value))} onKeyDown={(e) => key(i, e)}
      onPaste={(e) => paste(i, e)} onFocus={(e) => e.target.select()} />
  );

  return (
    <main className={`${s.page} ${s.verifyPage}`}>
      <p className={s.brand}>Halcyon Logistics</p>
      <Stepper />
      <section className={s.card} aria-labelledby="verify-title">
        <div className={s.cardHead}>
          <Countdown left={left} />
          <div>
            <div className={s.head}>
              <h1 id="verify-title">Check your inbox</h1>
              {view.synthetic && <SyntheticBadge />}
            </div>
            <p className={s.lead}>
              {sentAt === null ? 'We will email a 6-digit code to ' : 'Enter the 6-digit code we sent to '}
              <b>{view.verify.sentTo}</b>, the address your order came from. It expires in 10 minutes.
            </p>
          </div>
        </div>

        <form className={s.cardBody} onSubmit={(e) => { e.preventDefault(); if (complete && !busy) void verify(); }}>
          <span className={s.label} id="verify-email">Email</span>
          <div className={s.emailRow}>
            <div className={s.emailBox} aria-labelledby="verify-email" aria-readonly="true">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
              <span>{view.verify.sentTo}</span>
            </div>
            {sentAt === null && (
              <button type="button" className={s.sendBtn} disabled={busy || noMore || wait > 0} onClick={() => void sendCode()}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3 3 10.5l7 2.5 2.5 7L21 3Z" /><path d="m10 13 4.5-4.5" /></svg>
                {wait > 0 ? `Send code in ${clock(wait)}` : 'Send code'}
              </button>
            )}
          </div>
          {sentAt !== null && (
            <p className={s.sent} role="status">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.8 2.8L16.5 9.5" /></svg>
              Code sent at {new Date(sentAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              {left === 0 && <span> · expired</span>}
            </p>
          )}

          <div className={s.digits} role="group" aria-label="6-digit code">
            {[0, 1, 2].map(box)}
            <span className={s.dash} aria-hidden="true" />
            {[3, 4, 5].map(box)}
          </div>
          <div className={s.digitsMeta}>
            <span>{filled} of {DIGITS} digits entered · {triesLeft} {triesLeft === 1 ? 'attempt' : 'attempts'} left</span>
            {sentAt !== null && (
              <button type="button" className={s.linkBtn} disabled={busy || wait > 0 || noMore} onClick={() => void sendCode()}>
                {sendLabel}
              </button>
            )}
          </div>

          {note && <p role="alert" className={s.note}>{note}</p>}
          <button type="submit" className={s.button} disabled={busy || !complete}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.5-2" /></svg>
            Verify and continue
          </button>
        </form>

        <p className={s.cardFoot}>Didn&apos;t get it? Check your spam folder.</p>
      </section>

      <ul className={s.trust}>
        <li>Single-use code</li>
        <li>Expires in 10 minutes</li>
        <li>Sent only to the address your order came from</li>
      </ul>
      <p className={s.muted}>{expires ? `This link works until ${expires}.` : 'This link works for a limited time.'}</p>
    </main>
  );
}
