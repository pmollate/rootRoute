import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { BRAND } from '@/config/copy';

export const metadata: Metadata = {
  title: { template: `%s · ${BRAND}`, default: BRAND },
  description: 'Why Halcyon deliveries are late, and what each fix is worth.',
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
