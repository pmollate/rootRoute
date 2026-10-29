'use client';

import { signIn } from 'next-auth/react';
import { type FormEvent, useState } from 'react';
import s from './auth.module.css';

/** SPEC-auth §5.6: the messages a user may see on /login. Plain text, no technical detail (REQ-AUTH-12). */
const MESSAGES = {
  failed: 'Sign-in failed. Check your email and password.',
  limited: 'Too many attempts. Try again in a minute.',
  microsoft: 'Microsoft sign-in is not available right now.',
};

interface Props {
  demo: boolean;          // AUTH_DEMO=on: the demo form is shown
  entra: boolean;         // Microsoft Entra ID is set up
  next: string;           // the safe return path (SEC-AUTH-12), already checked on the server
  error?: string;         // Auth.js `?error=` after a failed Microsoft sign-in
  signedOut?: boolean;
  expired?: boolean;      // came here from an action whose session had ended (REQ-AUTH-11)
}

export function LoginForm({ demo, entra, next, error, signedOut, expired }: Props) {
  const [message, setMessage] = useState<string | null>(error && error !== 'CredentialsSignin' ? MESSAGES.microsoft : null);
  const [busy, setBusy] = useState(false);

  async function onDemo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setMessage(null);
    const r = await signIn('demo', { email: String(form.get('email') ?? ''), password: String(form.get('password') ?? ''), redirect: false });
    setBusy(false);
    if (r?.ok && !r.error) window.location.assign(next);
    else setMessage(r?.code === 'rate_limited' ? MESSAGES.limited : MESSAGES.failed);
  }

  return (
    <div className={s.card}>
      <p className={s.brand}>LATELENS</p>
      <h1 className={s.title}>Sign in</h1>
      {expired && <p className={s.info}>Your session has ended. Sign in again; your changes are kept.</p>}
      {signedOut && <p className={s.info}>You are signed out of LateLens. This does not sign you out of Microsoft: on a shared computer, sign out there too.</p>}
      {message && <p className={s.alert} role="alert">{message}</p>}
      <button type="button" className={`${s.btn} ${s.primary}`} disabled={!entra || busy}
        onClick={() => void signIn('microsoft-entra-id', { redirectTo: next })}>Sign in with Microsoft</button>
      {!entra && !message && <p className={s.note}>{MESSAGES.microsoft}</p>}
      {demo && (
        <>
          <p className={s.or}>or, for the demo</p>
          <form className={s.form} onSubmit={onDemo}>
            <label>Email<input name="email" type="email" autoComplete="username" required /></label>
            <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
            <button type="submit" className={s.btn} disabled={busy}>Sign in with a demo account</button>
          </form>
        </>
      )}
    </div>
  );
}
