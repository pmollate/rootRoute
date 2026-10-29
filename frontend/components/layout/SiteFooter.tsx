'use client';

import { useRef } from 'react';
import { BrandMark } from '@/components/ui/BrandMark';
import { BRAND, copy } from '@/config/copy';
import { useMotion } from '@/hooks/useMotion';
import { gsap } from '@/lib/gsap';
import styles from './SiteFooter.module.css';

/** Page footer under the Deliver film: brand and call to action, link columns, then the legal line. Columns rise in turn. */
export function SiteFooter() {
  const ref = useRef<HTMLElement>(null);
  const f = copy.siteFooter;

  useMotion(ref, (root) => {
    gsap.from(root.querySelectorAll('[data-foot]'), {
      autoAlpha: 0, y: 28, duration: 0.7, stagger: 0.08, ease: 'power3.out',
      scrollTrigger: { trigger: root, start: 'top 85%', once: true },
    });
  });

  return (
    <footer ref={ref} className={styles.footer} aria-label="Site footer">
      <div className={styles.inner}>
        <div className={styles.top}>
          <div className={styles.brand} data-foot>
            <a className={styles.mark} href="/" aria-label={`${BRAND} home`}>
              <BrandMark className={styles.glyph} />
              {BRAND.toUpperCase()}
            </a>
            <p className={styles.tagline}>{f.tagline}</p>
            <p className={styles.body}>{f.body}</p>
            <a className={styles.cta} href={f.cta.href}>
              {f.cta.label}
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
            </a>
          </div>

          {f.columns.map((col) => (
            <nav key={col.title} className={styles.col} aria-label={col.title} data-foot>
              <h2 className={styles.colTitle}>{col.title}</h2>
              <ul>
                {col.links.map((l) => (
                  <li key={l.href}>
                    <a href={l.href}>{l.label}</a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <ul className={styles.trust} data-foot>
          {f.trust.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>

        <div className={styles.base}>
          <p>
            © {new Date().getFullYear()} {BRAND}. {f.note}
          </p>
          <a className={styles.backTop} href={f.top.href}>
            {f.top.label}
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13V3M4 7l4-4 4 4" /></svg>
          </a>
        </div>
      </div>
    </footer>
  );
}
