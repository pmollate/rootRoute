'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { MobileNav } from '@/components/layout/MobileNav';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { BrandMark } from '@/components/ui/BrandMark';
import { BRAND } from '@/config/copy';
import { SCREENS } from '@/config/dashboard';
import { Pill } from './ui';
import s from './shell.module.css';

/** 18px line icons for the side nav, keyed by screen href. */
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

/** Chrome for every /dashboard screen: side nav, breadcrumb bar with period and theme toggle. */
export function DashboardShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const current = SCREENS.find((sc) => path.startsWith(sc.href));
  const brand = (
    <Link className={s.brand} href="/">
      <BrandMark className={s.glyph} />
      <span>{BRAND}<small>Halcyon logistics</small></span>
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
      <aside className={s.side}>
        {brand}
        <p className={s.group}>Delivery intelligence</p>
        <nav className={s.nav} aria-label="Dashboard">
          {SCREENS.map((sc) => (
            <Link key={sc.href} className={s.link} href={sc.href} aria-current={sc === current ? 'page' : undefined}>
              <Icon>{ICONS[sc.href]}</Icon>
              {sc.label}
            </Link>
          ))}
        </nav>
        {dataset}
      </aside>
      <div className={s.body}>
        <header className={s.header}>
          <div className={s.lead}>
            <MobileNav label="Dashboard" brand={brand} footer={dataset}
              items={SCREENS.map((sc) => ({ href: sc.href, label: sc.label, icon: <Icon>{ICONS[sc.href]}</Icon>, current: sc === current }))} />
            <nav className={s.crumbs} aria-label="Breadcrumb">
              <ol>
                <li><Link href="/dashboard/overview">Halcyon</Link></li>
                {current && <li aria-current="page">{current.label}</li>}
              </ol>
            </nav>
          </div>
          <div className={s.tools}>
            <ThemeToggle />
          </div>
        </header>
        <main className={s.main}>{children}</main>
        <footer className={s.foot}>
          <p>Computed from the supplied Halcyon dataset · 48,340 deliveries · Apr–Sep 2026.</p>
          <p><Pill tone="synthetic">Synthetic</Pill> marks panels using generated data</p>
        </footer>
      </div>
    </div>
  );
}
