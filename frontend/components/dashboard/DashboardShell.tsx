'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { UserProvider } from '@/components/auth/UserContext';
import { UserMenu } from '@/components/auth/UserMenu';
import { MobileNav } from '@/components/layout/MobileNav';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { BrandMark } from '@/components/ui/BrandMark';
import h from '@/components/layout/SiteHeader.module.css';
import { BRAND } from '@/config/copy';
import { MORE, ORDERS, SCREENS } from '@/config/dashboard';
import { canOpen, type SessionUser } from '@/lib/auth/roles';
import { ReportsMenu } from './ReportsMenu';
import { Pill } from './ui';
import s from './shell.module.css';

/** 18px line icons for the mobile drawer, keyed by screen href. */
const ICONS: Record<string, ReactNode> = {
  '/dashboard/overview': <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  '/dashboard/intake': <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  '/dashboard/complaints': <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M12 7v4M12 14h.01" /></>,
  '/dashboard/warehouses': <><path d="M3 21V8l9-5 9 5v13" /><path d="M7 21v-8h10v8M7 17h10" /></>,
  '/dashboard/carriers': <><path d="M3 6h11v10H3zM14 9h4l3 3v4h-7" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
  '/dashboard/journey': <><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M8 19h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7" /></>,
  '/dashboard/replay': <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>,
  '/dashboard/labs': <><path d="M9 3h6M10 3v6l-5.5 9.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3" /><path d="M7.5 15h9" /></>,
  '/dashboard/settings': <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
};
const Icon = ({ children }: { children: ReactNode }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

/**
 * Chrome for every /dashboard screen: the landing page's floating pill bar (brand, the master navigation, theme toggle,
 * and the signed-in user: REQ-AUTH-08, -09); pages run full width. `user` is null when nobody is signed in
 * (AUTH_REQUIRED=off). Navigation: a Dashboard menu of the screens, Orders, Labs, Settings (config/dashboard.ts).
 */
export function DashboardShell({ children, user = null }: { children: ReactNode; user?: SessionUser | null }) {
  const path = usePathname();
  // REQ-AUTH-15: only the screens the user's roles may open; everything with nobody signed in (AUTH_REQUIRED=off).
  const screens = SCREENS.filter((sc) => canOpen(user?.roles ?? null, sc.href));
  const pinned = screens.some((sc) => sc.href === ORDERS.href) ? ORDERS : undefined;
  const reports = screens.filter((sc) => sc.href !== ORDERS.href);
  const current = [...screens, ...MORE].find((sc) => path.startsWith(sc.href))?.href;
  // One list for the phone drawer, in bar order, with the reports under a "Dashboard" heading.
  const drawer = [
    ...reports.map((sc) => ({ href: sc.href, label: sc.label, group: 'Dashboard' })),
    ...(pinned ? [{ href: pinned.href, label: pinned.label }] : []),
    ...MORE,
  ];
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
            items={drawer.map((it) => ({ ...it, icon: <Icon>{ICONS[it.href]}</Icon>, current: it.href === current }))} />
          {brand}
          <nav className={`${h.nav} ${s.nav}`} aria-label="Dashboard">
            {reports.length > 0 && (
              <ReportsMenu label="Dashboard" current={reports.some((sc) => sc.href === current) ? current : undefined}
                items={reports.map((sc) => ({ href: sc.href, label: sc.label, icon: <Icon>{ICONS[sc.href]}</Icon> }))} />
            )}
            {pinned && (
              <Link className={h.navLink} href={pinned.href} aria-current={pinned.href === current ? 'page' : undefined}>{pinned.label}</Link>
            )}
            {MORE.map((it) => (
              <Link key={it.href} className={h.navLink} href={it.href} aria-current={it.href === current ? 'page' : undefined}>{it.label}</Link>
            ))}
            <ThemeToggle />
          </nav>
          <UserMenu user={user} />
        </div>
      </header>
      <main className={s.main}><UserProvider user={user}>{children}</UserProvider></main>
      <footer className={s.foot}>
        <p>Computed from the supplied Halcyon dataset · 48,340 deliveries · Apr–Sep 2026 · 5 sites · 6 carriers.</p>
        <p><Pill tone="synthetic">Synthetic</Pill></p>
      </footer>
    </div>
  );
}
