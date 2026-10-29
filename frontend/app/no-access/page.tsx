import type { Metadata } from 'next';
import { SignOutButton } from '@/components/auth/SignOutButton';
import s from '@/components/auth/auth.module.css';
import { BRAND } from '@/config/copy';
import { currentUser } from '@/lib/auth/session';
import { ph } from '@/lib/ph';

export const metadata: Metadata = { title: `No access · ${BRAND}` };
export const dynamic = 'force-dynamic';

/** REQ-AUTH-03: signed in, but with none of the six LateLens roles. Who assigns roles is open (Q-AUTH-02). */
export default async function NoAccess() {
  const user = await currentUser();
  return (
    <main className={s.page}>
      <div className={s.card}>
        <p className={s.brand}>LATELENS</p>
        <h1 className={s.title}>No access</h1>
        <p className={s.lead}>
          {ph(`You are signed in as ${user?.name ?? 'an unknown user'} but have no LateLens role. Ask [ROLE_ADMIN] for access.`)}
        </p>
        <SignOutButton />
      </div>
    </main>
  );
}
