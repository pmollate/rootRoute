import type { Metadata } from 'next';
import Link from 'next/link';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { AutoAdvanceCard } from '@/components/dashboard/settings/AutoAdvanceCard';
import { ThemeSwitch } from '@/components/dashboard/settings/ThemeSwitch';
import s from '@/components/dashboard/settings/settings.module.css';
import ui from '@/components/dashboard/ui.module.css';
import { ROLE_LABELS } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

/**
 * Settings (master navigation): who is signed in and with which roles, the theme, and sign out. Read-only, except the admin's auto-advance switch.
 * A server page (it reads the session), so it uses the shared styles directly: components/dashboard/ui.tsx is for client screens.
 */
export default async function Page() {
  const user = await currentUser();
  const initial = (user?.name.trim()[0] ?? 'G').toUpperCase(); // G: guest
  return (
    <>
      <div className={ui.head}><h1 className={ui.title}>Settings</h1></div>
      <div className={s.page}>
        <section className={s.card} aria-labelledby="set-profile">
          <span className={s.avatar} aria-hidden="true">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="4" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></svg>
            <span className={s.badge}>{initial}</span>
          </span>
          <div className={s.body}>
            <h2 className={s.title} id="set-profile">{user ? user.name : 'Profile'}</h2>
            {user ? (
              <>
                <p className={s.text}>{user.demo ? 'Demo account' : 'Organisation account'}. A session ends 8 hours after sign-in.</p>
                <ul className={s.roles} aria-label="Roles">
                  {user.roles.length > 0 ? user.roles.map((r) => <li key={r}>{ROLE_LABELS[r]}</li>) : <li>No role</li>}
                </ul>
              </>
            ) : (
              // AUTH_REQUIRED=off and nobody signed in. Say nothing about how the app is configured.
              <p className={s.text}>You are not signed in. Your name and roles are shown here once you sign in.</p>
            )}
          </div>
          <div className={s.side}>
            {user ? <SignOutButton className={s.primary} /> : <Link className={s.primary} href="/login?next=/dashboard/settings">Sign in</Link>}
          </div>
        </section>

        <AutoAdvanceCard />

        <section className={s.card} aria-labelledby="set-appearance">
          <div className={s.body}>
            <h2 className={s.title} id="set-appearance">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 0 0 18Z" fill="currentColor" /></svg>
              Appearance
            </h2>
            <p className={s.text}>Light by default. The switch is remembered in this browser.</p>
          </div>
          <div className={s.side}><span className={s.label}>Theme</span><ThemeSwitch /></div>
        </section>
      </div>
    </>
  );
}
