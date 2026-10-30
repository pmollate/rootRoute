'use client';

import { useEffect, useRef, useState } from 'react';
import { ROLE_LABELS, type SessionUser } from '@/lib/auth/roles';
import { SignOutButton } from './SignOutButton';
import s from './auth.module.css';

/** Up to two initials from the display name ("Demo admin" → "DA"); "?" when there is none. */
export const initials = (name: string) =>
  name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';

/**
 * Header, every dashboard page (REQ-AUTH-08, -09): a profile icon with the user's initials, which opens a card with
 * their name, roles and demo status, and a round Logout icon button.
 */
export function UserMenu({ user }: { user: SessionUser | null }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  if (!user) return null; // AUTH_REQUIRED=off and nobody signed in: the header is as before P7
  const roles = user.roles.map((r) => ROLE_LABELS[r]).join(', ');
  return (
    <div className={s.user} ref={box}>
      <button type="button" className={s.avatar} aria-label={`Profile: ${user.name}`} aria-expanded={open}
        aria-controls="profile-card" onClick={() => setOpen((o) => !o)}>
        {initials(user.name)}
      </button>
      {open && (
        <div id="profile-card" className={s.profile} role="dialog" aria-label="Signed-in user">
          <p className={s.profileName}>{user.name}</p>
          <p className={s.profileMeta}>{roles}</p>
          {user.demo && <p className={s.profileMeta}>Demo account</p>}
        </div>
      )}
      <SignOutButton className={s.signOut} title="Logout" iconOnly />
    </div>
  );
}
