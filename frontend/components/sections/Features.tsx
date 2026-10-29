'use client';

import { useRef } from 'react';
import { copy } from '@/config/copy';
import { useMotion } from '@/hooks/useMotion';
import { nn } from '@/lib/format';
import { gsap } from '@/lib/gsap';
import { Kicker } from '../ui/Kicker';

/** S6b · Features: the dashboard's workspaces. A route line draws across, then the cards rise along it in turn. */
export function Features() {
  const ref = useRef<HTMLElement>(null);
  const c = copy.features;

  useMotion(ref, (root) => {
    const tl = gsap.timeline({ scrollTrigger: { trigger: root, start: 'top 70%', toggleActions: 'play none none reverse' } });
    tl.from('[data-feat-head]', { autoAlpha: 0, y: 24, duration: 0.6, ease: 'power3.out' }, 0);
    tl.fromTo('[data-feat-route]', { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.2, ease: 'power2.inOut' }, 0.1);
    tl.from('[data-feat]', { autoAlpha: 0, y: 36, scale: 0.97, duration: 0.7, stagger: 0.07, ease: 'power3.out' }, 0.25);
  });

  return (
    <section ref={ref} id="features" className="features" aria-labelledby="features-title">
      <div className="wrap">
        <div data-feat-head>
          <Kicker>{c.kicker}</Kicker>
          <h2 id="features-title" className="h2">
            {c.title}
          </h2>
        </div>
        <svg className="features-route" viewBox="0 0 1000 24" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 12 C 160 2, 260 22, 420 12 S 720 2, 1000 12" pathLength={1} data-feat-route />
        </svg>
        <ul className="features-grid">
          {c.items.map((it, i) => (
            <li key={it.t} className="feat" data-feat>
              <span className="feat-n">{nn(i + 1)}</span>
              <h3>{it.t}</h3>
              <p>{it.b}</p>
              <span className="feat-role">{it.role}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
