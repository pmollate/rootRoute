import type { Metadata } from 'next';
import { demoOn } from '@/auth';
import { LoginForm } from '@/components/auth/LoginForm';
import { LoginShowcase } from '@/components/auth/LoginShowcase';
import s from '@/components/auth/auth.module.css';
import { BRAND } from '@/config/copy';
import { safeReturnPath } from '@/lib/auth/safeNext';

export const metadata: Metadata = { title: `Sign in · ${BRAND}` };
export const dynamic = 'force-dynamic';

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** /login (SPEC-auth §5.6): the email and password form when AUTH_DEMO=on. Never shows a password. */
export default async function Login({ searchParams }: { searchParams: Search }) {
  const q = await searchParams;
  return (
    <main className={s.loginPage}>
      <div className={s.shell}>
        <LoginForm demo={demoOn()} next={safeReturnPath(one(q.next))} expired={one(q.expired) === '1'} />
        <LoginShowcase />
      </div>
    </main>
  );
}
