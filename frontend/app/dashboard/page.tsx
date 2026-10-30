import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth/session';
import { homeFor } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

/** /dashboard opens the signed-in user's start page (HOME); with nobody signed in (AUTH_REQUIRED=off), the first screen. */
export default async function DashboardHome() {
  const user = await currentUser();
  redirect(homeFor(user?.roles));
}
