import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { demoOn } from '@/auth';
import { LoginForm } from '@/components/auth/LoginForm';
import { LoginShowcase } from '@/components/auth/LoginShowcase';
import s from '@/components/auth/auth.module.css';
import { BRAND } from '@/config/copy';
import { homeFor } from '@/lib/auth/roles';
import { safeReturnPath } from '@/lib/auth/safeNext';
import { currentUser } from '@/lib/auth/session';

export const metadata: Metadata = { title: `Sign in · ${BRAND}` };
export const dynamic = 'force-dynamic';

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * /login (SPEC-auth §5.6): the email and password form when AUTH_DEMO=on. Never shows a password.
 * Already signed in (the landing page's "Log in" button, say): straight on to the page asked for, else the first page.
 */
export default async function Login({ searchParams }: { searchParams: Search }) {
  const q = await searchParams;
  const next = safeReturnPath(one(q.next));
  const user = await currentUser();
  if (user?.roles.length) redirect(next === '/dashboard' ? homeFor(user.roles) : next);
  return (
    <main className={s.loginPage}>
      <div className={s.shell}>
        <LoginForm demo={demoOn()} next={next} expired={one(q.expired) === '1'} />
        <LoginShowcase />
      </div>
    </main>
  );
}
