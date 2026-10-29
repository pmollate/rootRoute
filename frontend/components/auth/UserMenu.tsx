'use client';

import { Pill } from '@/components/dashboard/ui';
import { ROLE_LABELS, type SessionUser } from '@/lib/auth/roles';
import { SignOutButton } from './SignOutButton';
import s from './auth.module.css';

/** Header, every dashboard page (REQ-AUTH-08, -09): name, role badges, "Demo account" for demo users, and "Sign out". */
export function UserMenu({ user }: { user: SessionUser | null }) {
  if (!user) return null; // AUTH_REQUIRED=off and nobody signed in: the header is as before P7
  return (
    <div className={s.user}>
      <span className={s.name} title={user.name}>{user.name}</span>
      <span className={s.roles}>{user.roles.map((r) => <Pill key={r}>{ROLE_LABELS[r]}</Pill>)}</span>
      {user.demo && <Pill tone="synthetic" title="Signed in with a demo account; actions are recorded as demo:<email>">Demo account</Pill>}
      <SignOutButton className={s.signOut} />
    </div>
  );
}
