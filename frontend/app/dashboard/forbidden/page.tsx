import type { Metadata } from 'next';
import Link from 'next/link';
import { ForbiddenScene } from '@/components/auth/ForbiddenScene';
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
  const [home, ...rest] = open;
  return (
    <div className={s.forbidden}>
      <div className={s.forbiddenCopy}>
        <p className={s.oops}>Ooops…</p>
        <h1 className={s.forbiddenTitle}>This page is not available for your role</h1>
        <p className={s.forbiddenLead}>
          Signed in as {user?.name ?? 'an unknown user'}{roles.length > 0 && ` (${roles.map((r) => ROLE_LABELS[r]).join(', ')})`}.
          {home ? ' Go back to a screen your role can open.' : ''}
        </p>
        {home && <Link className={s.goBack} href={home.href}>Go back to {home.label}</Link>}
        {rest.length > 0 && (
          <div className={s.alsoOpen}>
            <p className={s.note}>You can also open:</p>
            <ul className={s.openList}>
              {rest.map((sc) => <li key={sc.href}><Link href={sc.href}>{sc.label}</Link></li>)}
            </ul>
          </div>
        )}
      </div>
      <ForbiddenScene className={s.forbiddenArt} />
    </div>
  );
}
