'use client';

import { useEffect, useRef } from 'react';
import { BRAND, copy } from '@/config/copy';
import { MOBILE_QUERY, scene } from '@/config/scenes';
import { useNear, useScene } from '@/hooks/useScene';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { ph } from '@/lib/ph';
import { Kicker } from '../Kicker';
import { Meter } from '../Meter';

const s = scene('optimize');
const media = s.media as Extract<NonNullable<typeof s.media>, { kind: 'cards' }>;

/**
 * S4 · 04 Optimize: three cards on a horizontal track. The active card's clip plays; the others
 * pause. Every clip loops. Stacks vertically on mobile.
 */
export function Optimize() {
  const ref = useRef<HTMLElement>(null);
  const vids = useRef<(HTMLVideoElement | null)[]>([]);
  const active = useRef(-1);
  const reduced = usePrefersReducedMotion();
  const c = copy.optimize;

  const activate = (i: number) => {
    if (i === active.current) return;
    active.current = i;
    ref.current?.querySelectorAll<HTMLElement>('[data-ocard]').forEach((el, k) => el.classList.toggle('is-active', k === i));
    vids.current.forEach((v, k) => {
      if (!v) return;
      if (k !== i) return v.pause();
      void v.play().catch(() => undefined);
    });
  };

  useScene(ref, s, {
    pin: ({ mobile }) => !mobile,
    build: (tl, { root, mobile }) => {
      if (mobile) return;
      const track = root.querySelector<HTMLElement>('[data-track]')!;
      const dist = () => track.scrollWidth - root.clientWidth;
      tl.fromTo(track, { x: 0 }, { x: () => -dist(), duration: 1 }, 0);
      tl.fromTo('[data-outline]', { x: 0 }, { x: () => -dist() * 0.3, duration: 1 }, 0);
    },
    onProgress: (p, { mobile }) => !mobile && activate(Math.round(p * 2)),
  });

  useNear(ref, () => vids.current.forEach((v) => v && (v.preload = 'auto')));

  // Mobile: no track, so each card plays while it is mostly on screen.
  useEffect(() => {
    if (reduced || !window.matchMedia(MOBILE_QUERY).matches) return;
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          const i = Number((e.target as HTMLElement).dataset.ocard);
          if (e.isIntersecting) activate(i);
        }),
      { threshold: 0.6 },
    );
    ref.current?.querySelectorAll('[data-ocard]').forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  return (
    <section ref={ref} id="optimize" className="scene optimize" aria-labelledby="optimize-title">
      <span className="outline-word" data-outline aria-hidden="true">
        {`${BRAND} · ${BRAND}`.toUpperCase()}
      </span>
      <div className="optimize-head">
        <Kicker>{c.kicker}</Kicker>
        <h2 id="optimize-title" className="h2">
          {c.title}
        </h2>
      </div>
      <ol className="track" data-track>
        {c.cards.map((card, i) => (
          <li key={card.t} className={`ocard ${i === 0 ? 'is-active' : ''}`} data-ocard={i}>
            <div className="ocard-media">
              {reduced ? (
                <img className="cover" src={media.posters[i]} alt="" />
              ) : (
                <video
                  ref={(v) => {
                    vids.current[i] = v;
                  }}
                  className="cover"
                  src={media.srcs[i]}
                  poster={media.posters[i]}
                  muted
                  playsInline
                  loop
                  preload="none"
                  aria-hidden="true"
                />
              )}
              <span className="ocard-chip">0{i + 1}</span>
            </div>
            <div className="ocard-copy">
              <span className="ocard-step">Step 0{i + 1} / 0{c.cards.length}</span>
              <div>
                <h3>{card.t}</h3>
                <p>{ph(card.b)}</p>
                <Meter id={card.meter.id} label={card.meter.label} start={card.meter.start} />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
