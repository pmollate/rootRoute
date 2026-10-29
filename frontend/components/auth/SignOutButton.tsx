'use client';

import { signOut } from 'next-auth/react';
import s from './auth.module.css';

/** REQ-AUTH-08: ends the LateLens session and opens /login, which says Microsoft is not signed out. */
export function SignOutButton({ className = s.btn }: { className?: string }) {
  return <button type="button" className={className} onClick={() => void signOut({ redirectTo: '/login?signedOut=1' })}>Sign out</button>;
}
