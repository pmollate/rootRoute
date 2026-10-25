'use client';

import { useRef } from 'react';
import { copy } from '@/config/copy';
import { useIsoLayoutEffect } from '@/hooks/useIsoLayoutEffect';
import { gsap } from '@/lib/gsap';
import { ph } from '@/lib/ph';
import { Kicker } from '../Kicker';

/** S6 · Results: the four stats count up when the section enters; the security line comes last. */
export function Results() {
  const ref = useRef<HTMLElement>(null);
  const c = copy.results;

  useIsoLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const nums = gsap.utils.toArray<HTMLElement>('[data-count]', root);
      const tl = gsap.timeline({ scrollTrigger: { trigger: root, start: 'top 65%', once: true } });
      tl.from('[data-stat]', { autoAlpha: 0, y: 30, duration: 0.6, stagger: 0.08, ease: 'power3.out' }, 0);
      nums.forEach((el, i) => {
        const n = { v: 0 };
        const to = Number(el.dataset.count);
        el.textContent = '0';
        tl.to(n, { v: to, duration: 1.4, ease: 'power2.out', onUpdate: () => (el.textContent = String(Math.round(n.v))) }, 0.1 + i * 0.08);
      });
      tl.from('[data-security]', { autoAlpha: 0, y: 12, duration: 0.6 }, '-=0.4');
    }, root);
    return () => mm.revert();
  }, []);

  return (
    <section ref={ref} id="results" className="results dark" aria-labelledby="results-title">
      <div className="wrap">
        <Kicker light>{c.kicker}</Kicker>
        <h2 id="results-title" className="h2">
          {c.title}
        </h2>
        <dl className="stats">
          {c.stats.map((st) => (
            <div key={st.label} className="stat" data-stat>
              <dt>{st.label}</dt>
              <dd>
                <span className={st.ph ? 'ph' : undefined} title={st.ph ? 'Placeholder figure' : undefined}>
                  <span data-count={st.value}>{st.value}</span>
                  <span className="stat-unit">{st.suffix}</span>
                </span>
              </dd>
            </div>
          ))}
        </dl>
        <p className="security" data-security>
          {ph(c.security)}
        </p>
      </div>
    </section>
  );
}
