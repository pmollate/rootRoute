'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { UserMenu } from '@/components/auth/UserMenu';
import { MobileNav } from '@/components/layout/MobileNav';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { BrandMark } from '@/components/ui/BrandMark';
import h from '@/components/layout/SiteHeader.module.css';
import { BRAND } from '@/config/copy';
import { SCREENS } from '@/config/dashboard';
import type { SessionUser } from '@/lib/auth/roles';
import { Pill } from './ui';
import s from './shell.module.css';

/** 18px line icons for the mobile drawer, keyed by screen href. */
const ICONS: Record<string, ReactNode> = {
  '/dashboard/overview': <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  '/dashboard/intake': <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  '/dashboard/warehouses': <><path d="M3 21V8l9-5 9 5v13" /><path d="M7 21v-8h10v8M7 17h10" /></>,
  '/dashboard/carriers': <><path d="M3 6h11v10H3zM14 9h4l3 3v4h-7" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
  '/dashboard/journey': <><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M8 19h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7" /></>,
  '/dashboard/replay': <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>,
};
const Icon = ({ children }: { children: ReactNode }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

/**
 * Chrome for every /dashboard screen: the landing page's floating pill bar (brand, screen links, theme toggle, and the
 * signed-in user: REQ-AUTH-08, -09); pages run full width. `user` is null when nobody is signed in (AUTH_REQUIRED=off).
 */
export function DashboardShell({ children, user = null }: { children: ReactNode; user?: SessionUser | null }) {
  const path = usePathname();
  const current = SCREENS.find((sc) => path.startsWith(sc.href));
  const brand = (
    <Link className={h.mark} href="/" aria-label={`${BRAND} home`}>
      <BrandMark className={h.glyph} />
      {BRAND.toUpperCase()}
    </Link>
  );
  const dataset = (
    <div className={s.dataset}>
      <p className={s.datasetHead}>Dataset</p>
      <b>48,340 deliveries</b>
      <span>Apr–Sep 2026 · 5 sites · 6 carriers</span>
    </div>
  );
  return (
    <div className={s.page}>
      <header className={s.header}>
        <div className={h.bar}>
          <MobileNav label="Dashboard" brand={brand} footer={dataset}
            items={SCREENS.map((sc) => ({ href: sc.href, label: sc.label, icon: <Icon>{ICONS[sc.href]}</Icon>, current: sc === current }))} />
          {brand}
          <nav className={`${h.nav} ${s.nav}`} aria-label="Dashboard">
            {SCREENS.map((sc) => (
              <Link key={sc.href} className={h.navLink} href={sc.href} aria-current={sc === current ? 'page' : undefined}>{sc.label}</Link>
            ))}
            <ThemeToggle />
          </nav>
          <UserMenu user={user} />
        </div>
      </header>
      <main className={s.main}>{children}</main>
      <footer className={s.foot}>
        <p>Computed from the supplied Halcyon dataset · 48,340 deliveries · Apr–Sep 2026 · 5 sites · 6 carriers.</p>
        <p><Pill tone="synthetic">Synthetic</Pill></p>
      </footer>
    </div>
  );
}
