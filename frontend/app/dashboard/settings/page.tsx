import type { Metadata } from 'next';
import { SignOutButton } from '@/components/auth/SignOutButton';
import ui from '@/components/dashboard/ui.module.css';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { ROLE_LABELS } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

/**
 * Settings (master navigation): who is signed in and with which roles, the theme, and sign out. Read-only.
 * A server page (it reads the session), so it uses the shared styles directly: components/dashboard/ui.tsx is for client screens.
 */
export default async function Page() {
  const user = await currentUser();
  return (
    <>
      <div className={ui.head}><h1 className={ui.title}>Settings</h1></div>
      <section className={ui.card}>
        <h2 className={ui.cardTitle}>Profile</h2>
        {user ? (
          <dl className={ui.facts}>
            <dt>Name</dt><dd>{user.name}</dd>
            <dt>Roles</dt><dd>{user.roles.map((r) => ROLE_LABELS[r]).join(', ') || 'None'}</dd>
            <dt>Account</dt><dd>{user.demo ? 'Demo account' : 'Organisation account'}</dd>
          </dl>
        ) : (
          <p className={ui.lede}>Nobody is signed in: sign-in is switched off (AUTH_REQUIRED=off).</p>
        )}
      </section>
      <section className={ui.card}>
        <h2 className={ui.cardTitle}>Appearance</h2>
        <p className={ui.lede}>Light by default. The switch is remembered in this browser.</p>
        <p className={ui.row}>Theme <ThemeToggle /></p>
      </section>
      {user && (
        <section className={ui.card}>
          <h2 className={ui.cardTitle}>Session</h2>
          <p className={ui.lede}>A session ends 8 hours after sign-in.</p>
          <p className={ui.row}><SignOutButton /></p>
        </section>
      )}
    </>
  );
}
