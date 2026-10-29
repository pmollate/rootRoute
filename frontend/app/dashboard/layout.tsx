import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { BRAND } from '@/config/copy';
import { currentUser } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: { template: `%s · ${BRAND}`, default: BRAND },
  description: 'Why Halcyon deliveries are late, and what each fix is worth.',
};

// Rendered per request: the header and role-gated buttons follow the signed-in user (AUTH_SECRET is a run-time setting).
export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardShell user={await currentUser()}>{children}</DashboardShell>;
}
