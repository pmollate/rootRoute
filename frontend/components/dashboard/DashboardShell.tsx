'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { BRAND } from '@/config/copy';
import { SCREENS } from '@/config/dashboard';
import s from './shell.module.css';

/** Chrome for every /dashboard screen: brand back to the landing page, screen nav, theme toggle. */
export function DashboardShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <div className={s.page}>
      <header className={s.header}>
        <div className={s.bar}>
          <Link className={s.brand} href="/">
            <span className={s.glyph} aria-hidden="true" />
            {BRAND}
          </Link>
          <nav className={s.nav} aria-label="Dashboard">
            {SCREENS.map((sc) => (
              <Link key={sc.href} className={s.link} href={sc.href} aria-current={path === sc.href ? 'page' : undefined}>
                {sc.label}
              </Link>
            ))}
            <ThemeToggle />
          </nav>
        </div>
      </header>
      <main className={s.main}>{children}</main>
      <p className={s.foot}>
        Figures are computed from the supplied Halcyon dataset (48,340 deliveries). Panels marked Synthetic data use data we generated.
      </p>
    </div>
  );
}
