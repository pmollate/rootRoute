'use client';

import { signOut } from 'next-auth/react';
import s from './auth.module.css';

/**
 * REQ-AUTH-08: ends the LateLens session and opens /login, which says Microsoft is not signed out.
 * `iconOnly`: just the symbol (the header); the name stays on the button for screen readers.
 */
export function SignOutButton({ className = s.btn, title, iconOnly = false }: { className?: string; title?: string; iconOnly?: boolean }) {
  return (
    <button type="button" className={className} title={title} aria-label="Logout"
      onClick={() => void signOut({ redirectTo: '/login?signedOut=1' })}>
      <svg width={iconOnly ? 16 : 14} height={iconOnly ? 16 : 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
        strokeLinejoin="round" aria-hidden="true">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" />
      </svg>
      {!iconOnly && 'Logout'}
    </button>
  );
}
