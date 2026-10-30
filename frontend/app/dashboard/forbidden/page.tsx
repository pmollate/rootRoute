import type { Metadata } from 'next';
import Link from 'next/link';
import s from '@/components/auth/auth.module.css';
import { MORE, SCREENS } from '@/config/dashboard';
import { ROLE_LABELS, canOpen } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Not available for your role' };

/** REQ-AUTH-15: middleware rewrites a screen outside the role's page matrix here (HTTP 403), keeping the dashboard bar. */
export default async function Forbidden() {
  const user = await currentUser();
  const roles = user?.roles ?? [];
  const open = [...SCREENS, ...MORE].filter((sc) => canOpen(roles, sc.href));
  return (
    <div className={s.inShell}>
      <div className={s.card}>
        <h1 className={s.title}>This page is not available for your role</h1>
        <p className={s.lead}>
          Signed in as {user?.name ?? 'an unknown user'}{roles.length > 0 && ` (${roles.map((r) => ROLE_LABELS[r]).join(', ')})`}.
        </p>
        <p className={s.note}>You can open:</p>
        <ul className={s.links}>
          {open.map((sc) => <li key={sc.href}><Link href={sc.href}>{sc.label}</Link></li>)}
        </ul>
      </div>
    </div>
  );
}
