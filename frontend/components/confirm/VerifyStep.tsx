'use client';

import { useEffect, useState } from 'react';
import { SyntheticBadge } from '@/components/dashboard/ui';
import { ConfirmScreen, type LinkView } from './ConfirmScreen';
import s from './confirm.module.css';
import { LINK_INVALID_TEXT } from './text';

/**
 * CONTRACTS (E19, REQ-LINK-17): what `GET /api/confirm/:token` returns with CONFIRM_LINK_CODE on and no valid
 * x-link-verify header: the masked sender, the link's expiry and the synthetic flag. Nothing about the address or order.
 */
export interface VerifyView { verify: { sentTo: string }; expiresAt: string; synthetic: boolean }

const until = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const json = { 'content-type': 'application/json' };

type Phase =
  | { kind: 'verify' }
  | { kind: 'address'; view: LinkView; verifyToken: string }
  | { kind: 'invalid' };

/**
 * E19 (SPEC §5.17 "Verification code", REQ-LINK-17 to -19): the "Verify it's you" step before the address page. Shows
 * only the masked sender and the link's expiry. **Send code** (a POST, never on page load: mail scanners open links)
 * emails a 6-digit code; the right code returns a verification token, held here in memory only, with which the page
 * fetches the address and shows ConfirmScreen. A 401 verify_required there comes back to this step.
 */
export function VerifyStep({ token, view }: { token: string; view: VerifyView }) {
  const base = `/api/confirm/${encodeURIComponent(token)}`;
  const [phase, setPhase] = useState<Phase>({ kind: 'verify' });
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [wait, setWait] = useState(0);          // seconds until another code may be sent
  const [noMore, setNoMore] = useState(false);  // the link's codes are used up
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Formatted after hydration, in the reader's locale and zone (as ConfirmScreen does).
  const [expires, setExpires] = useState<string | null>(null);
  useEffect(() => { setExpires(until(view.expiresAt)); }, [view.expiresAt]);
  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function sendCode() {
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch(`${base}/code`, { method: 'POST', headers: json, cache: 'no-store', body: '{}' });
      if (r.status === 200) {
        const b = (await r.json()) as { sentTo: string; retryIn: number };
        setSentTo(b.sentTo);
        setWait(b.retryIn);
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

  if (phase.kind === 'invalid') return <main className={s.page}><p className={s.message}>{LINK_INVALID_TEXT}</p></main>;
  if (phase.kind === 'address') {
    return <ConfirmScreen token={token} view={phase.view} verifyToken={phase.verifyToken}
      onVerifyRequired={() => { setCode(''); setNote(null); setPhase({ kind: 'verify' }); }} />;
  }

  return (
    <main className={s.page}>
      <p className={s.brand}>Halcyon Logistics</p>
      <header className={s.head}>
        <h1>Verify it&apos;s you</h1>
        {view.synthetic && <SyntheticBadge />}
      </header>
      <p className={s.muted}>To keep your address safe, we email a 6-digit code to {view.verify.sentTo}, the address your order came from.</p>
      <p className={s.muted}>{expires ? `This link works until ${expires}.` : 'This link works for a limited time.'}</p>

      <div className={s.form}>
        <button type="button" className={s.button} disabled={busy || wait > 0 || noMore} onClick={() => void sendCode()}>
          {sentTo ? 'Send a new code' : 'Send code'}
        </button>
        {sentTo && <p className={s.muted} role="status">Code sent to {sentTo}. It expires in 10 minutes.</p>}
        {wait > 0 && <p className={s.muted}>You can send a new code in {wait} s.</p>}
      </div>

      <form className={s.form} onSubmit={(e) => { e.preventDefault(); if (code.length === 6) void verify(); }}>
        <label className={s.field}>
          <span>6-digit code</span>
          <input name="code" aria-label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}"
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
        </label>
        {note && <p role="alert" className={s.note}>{note}</p>}
        <button type="submit" className={s.button} disabled={busy || code.length !== 6}>Verify</button>
      </form>
    </main>
  );
}
