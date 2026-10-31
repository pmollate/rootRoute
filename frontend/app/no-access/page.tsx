import type { Metadata } from 'next';
import { GuardScene } from '@/components/auth/GuardScene';
import { BrandMark } from '@/components/ui/BrandMark';
import { SignOutButton } from '@/components/auth/SignOutButton';
import s from '@/components/auth/auth.module.css';
import { BRAND } from '@/config/copy';
import { currentUser } from '@/lib/auth/session';

export const metadata: Metadata = { title: `No access · ${BRAND}` };
export const dynamic = 'force-dynamic';

/** REQ-AUTH-03: signed in, but with none of the six LateLens roles. */
export default async function NoAccess() {
  const user = await currentUser();
  return (
    <main className={s.deniedPage}>
      <p className={s.logo}><BrandMark className={s.logoMark} />{BRAND.toUpperCase()}</p>
      <div className={s.scene}>
        <GuardScene className={s.sceneArt} />
        <div className={s.sceneCopy}>
          <h1 className={s.deniedTitle}>Hold up!</h1>
          <p className={s.deniedCode}>Error 401: Unauthorized.</p>
        </div>
      </div>
      <p className={s.deniedLead}>
        You are signed in as {user?.name ?? 'an unknown user'} but have no Root Route role.
      </p>
      <SignOutButton className={`${s.btn} ${s.deniedBtn}`} />
    </main>
  );
}
