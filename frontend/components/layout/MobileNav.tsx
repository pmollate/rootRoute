'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './MobileNav.module.css';

export interface MobileNavItem { href: string; label: string; icon?: ReactNode; current?: boolean }

/** Matches the breakpoint where the landing nav links and the dashboard side nav hide. */
const MOBILE = '(max-width: 860px)';

/**
 * Hamburger (shown on phones and small tablets) that opens a nav drawer from the left over a scrim.
 * The drawer is portalled to <body> so a header's backdrop-filter can't become its containing block.
 */
export function MobileNav({ label, brand, items, footer }: {
  label: string; brand: ReactNode; items: MobileNavItem[]; footer?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => setMounted(true), []);

  // While open: lock page scroll, close on Escape or on growing past the breakpoint, keep Tab inside the drawer.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = 'hidden';
    panel.current?.querySelector<HTMLElement>('a, button')?.focus();
    const mq = window.matchMedia(MOBILE);
    const onResize = () => !mq.matches && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return setOpen(false);
      if (e.key !== 'Tab' || !panel.current) return;
      const focusable = panel.current.querySelectorAll<HTMLElement>('a, button');
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    mq.addEventListener('change', onResize);
    document.addEventListener('keydown', onKey);
    return () => {
      root.style.overflow = overflow;
      mq.removeEventListener('change', onResize);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Focus goes back to the hamburger once the drawer closes.
  useEffect(() => {
    if (wasOpen.current && !open) button.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open]);

  const close = () => setOpen(false);
  return (
    <>
      <button ref={button} type="button" className={styles.burger} aria-label={`Open ${label.toLowerCase()} menu`}
        aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
      </button>
      {mounted && createPortal(
        // data-lenis-prevent: wheel and touch over the overlay stay with it instead of scrolling the page
        <div className={styles.overlay} data-open={open} data-lenis-prevent inert={!open}>
          <div className={styles.scrim} onClick={close} aria-hidden="true" />
          <div ref={panel} id="mobile-nav" className={styles.drawer} role="dialog" aria-modal="true" aria-label={label}>
            <div className={styles.head}>
              {brand}
              <button type="button" className={styles.close} aria-label="Close menu" onClick={close}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>
            <nav aria-label={label}>
              <ul className={styles.list}>
                {items.map((it) => {
                  const inner = <>{it.icon}{it.label}</>;
                  const props = { className: styles.item, onClick: close, 'aria-current': it.current ? ('page' as const) : undefined };
                  // In-page anchors stay plain links so Lenis (anchors: true) runs the smooth scroll.
                  return (
                    <li key={it.href}>
                      {it.href.startsWith('#') ? <a href={it.href} {...props}>{inner}</a> : <Link href={it.href} {...props}>{inner}</Link>}
                    </li>
                  );
                })}
              </ul>
            </nav>
            {footer && <div className={styles.foot}>{footer}</div>}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
