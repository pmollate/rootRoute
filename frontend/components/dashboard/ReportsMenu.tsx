'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import h from '@/components/layout/SiteHeader.module.css';
import s from './shell.module.css';

export interface MenuItem { href: string; label: string; icon?: ReactNode }

/**
 * The bar's "Dashboard" menu: every report screen the user may open. Opens on click, closes on a pick, Escape, a click
 * elsewhere or a route change; it reads as current while one of its screens is open.
 */
export function ReportsMenu({ label, items, current }: { label: string; items: MenuItem[]; current?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  const path = usePathname();

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <div className={s.menuBox} ref={box}>
      <button ref={button} type="button" className={`${h.navLink} ${s.menuBtn}`} aria-expanded={open} aria-controls={id}
        data-current={current ? 'true' : undefined} onClick={() => setOpen((o) => !o)}>
        {label}
        <svg className={s.caret} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <ul id={id} className={s.menu}>
          {items.map((it) => (
            <li key={it.href}>
              <Link href={it.href} className={s.menuItem} aria-current={it.href === current ? 'page' : undefined} onClick={() => setOpen(false)}>
                {it.icon}{it.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
