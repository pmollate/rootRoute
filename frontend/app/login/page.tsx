import type { Metadata } from 'next';
import { demoOn, entraConfigured } from '@/auth';
import { LoginForm } from '@/components/auth/LoginForm';
import { LoginShowcase } from '@/components/auth/LoginShowcase';
import s from '@/components/auth/auth.module.css';
import { BRAND } from '@/config/copy';
import { safeReturnPath } from '@/lib/auth/safeNext';

export const metadata: Metadata = { title: `Sign in · ${BRAND}` };
export const dynamic = 'force-dynamic';

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** /login (SPEC-auth §5.6): Microsoft first, the demo form below it when AUTH_DEMO=on. Never shows a password. */
export default async function Login({ searchParams }: { searchParams: Search }) {
  const q = await searchParams;
  return (
    <main className={s.loginPage}>
      <div className={s.shell}>
        <LoginForm demo={demoOn()} entra={entraConfigured()} next={safeReturnPath(one(q.next))} error={one(q.error)}
          signedOut={one(q.signedOut) === '1'} expired={one(q.expired) === '1'} />
        <LoginShowcase />
      </div>
    </main>
  );
}
