'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';
import { BrandMark } from '@/components/ui/BrandMark';
import { BRAND } from '@/config/copy';
import s from './auth.module.css';

/** SPEC-auth §5.6: the messages a user may see on /login. Plain text, no technical detail. */
const MESSAGES = {
  failed: 'Sign-in failed. Check your email and password.',
  limited: 'Too many attempts. Try again in a minute.',
};

/** What the button says while it works: checking the password, then loading the dashboard. */
const BUSY = { checking: 'Signing in…', opening: 'Opening your dashboard…' };
type Phase = 'idle' | keyof typeof BUSY;

const csrf = () => fetch('/api/auth/csrf').then((r) => r.json() as Promise<{ csrfToken: string }>).then((d) => d.csrfToken);

/**
 * One POST to the demo callback, with a CSRF token fetched while the user types. next-auth/react's signIn() would add
 * a providers lookup before it and a session refresh after it; the full page load that follows makes both redundant.
 */
async function demoSignIn(token: Promise<string>, email: string, password: string): Promise<{ ok: boolean; code?: string }> {
  const res = await fetch('/api/auth/callback/demo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Auth-Return-Redirect': '1' },
    body: new URLSearchParams({ email, password, csrfToken: await token }),
  });
  const url = new URL(((await res.json()) as { url: string }).url, window.location.origin);
  return { ok: res.ok && !url.searchParams.has('error'), code: url.searchParams.get('code') ?? undefined };
}

interface Props {
  demo: boolean;          // AUTH_DEMO=on: the sign-in form is shown
  next: string;           // the safe return path (SEC-AUTH-12), already checked on the server
  expired?: boolean;      // came here from an action whose session had ended (REQ-AUTH-11)
}

/** Email and password only: the Microsoft button is not shown (Entra stays configurable in auth.ts). */
export function LoginForm({ demo, next, expired }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [showPw, setShowPw] = useState(false);
  const token = useRef<Promise<string> | null>(null);

  // Fetched on arrival, so pressing Sign in costs one request, not two.
  useEffect(() => {
    if (demo) token.current = csrf().catch(() => '');
    // Back from the dashboard: the browser may restore this page as it was left, still "Opening".
    const onShow = (e: PageTransitionEvent) => e.persisted && setPhase('idle');
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, [demo]);

  async function onDemo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (phase !== 'idle') return;
    const form = new FormData(e.currentTarget);
    setPhase('checking');
    setMessage(null);
    try {
      const r = await demoSignIn(token.current ?? csrf(), String(form.get('email') ?? ''), String(form.get('password') ?? ''));
      if (r.ok) {
        // Stays busy until the dashboard replaces this page; /dashboard sends the user on to their first page.
        setPhase('opening');
        window.location.assign(next);
        return;
      }
      setMessage(r.code === 'rate_limited' ? MESSAGES.limited : MESSAGES.failed);
    } catch {
      setMessage(MESSAGES.failed);
    }
    token.current = csrf().catch(() => ''); // a failed attempt may have rotated the token
    setPhase('idle');
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
              <button type="submit" className={`${s.cta} ${s.ctaPrimary}`} disabled={phase !== 'idle'} aria-busy={phase !== 'idle'}>
                {phase === 'idle' ? 'Sign in' : <><span className={s.spinner} aria-hidden="true" />{BUSY[phase]}</>}
              </button>
              <p className={s.srOnly} role="status">{phase === 'idle' ? '' : BUSY[phase]}</p>
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
