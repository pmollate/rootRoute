'use client';

import { useRef } from 'react';
import { copy } from '@/config/copy';
import { useMotion } from '@/hooks/useMotion';
import { nn } from '@/lib/format';
import { gsap } from '@/lib/gsap';
import { Kicker } from '../ui/Kicker';

/** S7 · Built for people: four cards tilt up out of depth; the dispatcher view slides in. */
export function People() {
  const ref = useRef<HTMLElement>(null);
  const c = copy.people;

  useMotion(ref, (root) => {
    const st = { trigger: root, start: 'top 70%', toggleActions: 'play none none reverse' };
    gsap.from('[data-pcard]', {
      rotateX: 14, y: 50, autoAlpha: 0, transformPerspective: 900, transformOrigin: '50% 100%',
      duration: 0.9, stagger: 0.1, ease: 'power3.out', scrollTrigger: st,
    });
    gsap.from('[data-dash]', { x: 120, autoAlpha: 0, duration: 1, delay: 0.2, ease: 'power3.out', scrollTrigger: st });
  });

  return (
    <section ref={ref} id="people" className="people" aria-labelledby="people-title">
      <div className="wrap people-grid">
        <div>
          <Kicker>{c.kicker}</Kicker>
          <h2 id="people-title" className="h2">
            {c.title}
          </h2>
          <ul className="pcards">
            {c.items.map((it, i) => (
              <li key={it.t} className="pcard" data-pcard>
                <span className="pcard-n">{nn(i + 1)}</span>
                <h3>{it.t}</h3>
                <p>{it.b}</p>
              </li>
            ))}
          </ul>
        </div>
        <DashboardMock />
      </div>
    </section>
  );
}

/** One delivery's journey: each check with its plain-language reason, and the root cause at the foot. */
function DashboardMock() {
  const d = copy.people.dashboard;
  return (
    <figure className="dash" data-dash aria-label="Example order journey">
      <div className="dash-top">
        <span className="dash-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="dash-live">Live</span>
      </div>
      <div className="dash-body">
        <p className="dash-title">{d.title}</p>
        <svg className="dash-map" viewBox="0 0 320 120" aria-hidden="true">
          <path d="M20 96 C 80 90, 90 40, 150 46 S 250 20, 300 26" fill="none" stroke="var(--line)" strokeWidth="10" strokeLinecap="round" />
          <path d="M20 96 C 80 90, 90 40, 150 46 S 250 20, 300 26" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
          <circle cx="20" cy="96" r="6" fill="var(--ink)" />
          <circle cx="150" cy="46" r="5" fill="var(--surface)" stroke="var(--ink)" strokeWidth="2" />
          <circle cx="300" cy="26" r="7" fill="var(--accent)" />
        </svg>
        <ul className="dash-rows">
          {d.rows.map((r) => (
            <li key={r.k}>
              <span className="dash-k">{r.k}</span>
              <span className="dash-v">{r.v}</span>
              <span className="dash-why">{r.why}</span>
              {'act' in r && (
                <button type="button" className="dash-override" tabIndex={-1} aria-hidden="true">
                  {r.act}
                </button>
              )}
            </li>
          ))}
        </ul>
        <p className="dash-eta">{d.eta}</p>
      </div>
    </figure>
  );
}
