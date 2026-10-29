'use client';

import { signIn } from 'next-auth/react';
import { type FormEvent, useState } from 'react';
import { BrandMark } from '@/components/ui/BrandMark';
import { BRAND } from '@/config/copy';
import s from './auth.module.css';

/** SPEC-auth §5.6: the messages a user may see on /login. Plain text, no technical detail. */
const MESSAGES = {
  failed: 'Sign-in failed. Check your email and password.',
  limited: 'Too many attempts. Try again in a minute.',
};

interface Props {
  demo: boolean;          // AUTH_DEMO=on: the sign-in form is shown
  next: string;           // the safe return path (SEC-AUTH-12), already checked on the server
  expired?: boolean;      // came here from an action whose session had ended (REQ-AUTH-11)
}

/** Email and password only: the Microsoft button is not shown (Entra stays configurable in auth.ts). */
export function LoginForm({ demo, next, expired }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);

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
    <section className={s.panel}>
      <p className={s.logo}><BrandMark className={s.logoMark} />{BRAND.toUpperCase()}</p>
      <div className={s.panelBody}>
        <h1 className={s.hello}>Welcome back</h1>
        <p className={s.sub}>Sign in to your delivery diagnostics workspace.</p>
        {expired && <p className={s.info}>Your session has ended. Sign in again; your changes are kept.</p>}
        {message && <p className={s.alert} role="alert">{message}</p>}
        {demo && (
          <>
            <form className={s.fields} onSubmit={onDemo}>
              <label><span className={s.srOnly}>Email</span>
                <input name="email" type="email" placeholder="Email address" autoComplete="username" required /></label>
              <div className={s.pwField}>
                <label><span className={s.srOnly}>Password</span>
                  <input name="password" type={showPw ? 'text' : 'password'} placeholder="Password" autoComplete="current-password" required /></label>
                <button type="button" className={s.eye} aria-label={showPw ? 'Hide password' : 'Show password'} aria-pressed={showPw}
                  onClick={() => setShowPw((v) => !v)}><EyeIcon off={showPw} /></button>
              </div>
              <button type="submit" className={`${s.cta} ${s.ctaPrimary}`} disabled={busy}>Sign in </button>
            </form>
          </>
        )}
      </div>
      <p className={s.foot}>Need access? Ask your {BRAND} administrator.</p>
    </section>
  );
}

/** Eye, or eye struck through once the password is showing. */
function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );
}
