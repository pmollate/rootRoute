'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Media } from '@/config/scenes';
import { copy } from '@/config/copy';
import { useIsoLayoutEffect } from '@/hooks/useIsoLayoutEffect';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

type Slides = Extract<Media, { kind: 'slides' }>['slides'];

// Long and soft-landing; the next slide starts this long before the clip ends, so nothing ever freezes.
const SLIDE = { duration: 1400, easing: 'cubic-bezier(0.45, 0, 0.15, 1)' };
const LEAD = SLIDE.duration / 1000;

/**
 * The hero frame ([data-hero-video]) with its clips in turn: each plays once, then the next slides in
 * from the right, forever. `children` are the overlays drawn over every slide. The dots sit outside the
 * frame so its scroll clip-path never cuts them. Under reduced motion: posters only, no auto-advance;
 * the dots still switch slides.
 */
export function HeroSlides({ slides, children }: { slides: Slides; children?: ReactNode }) {
  const [active, setActive] = useState(0);
  const prev = useRef(active);
  const slideEls = useRef<(HTMLDivElement | null)[]>([]);
  const videos = useRef<(HTMLVideoElement | null)[]>([]);
  const reduced = usePrefersReducedMotion();

  // Before paint, so the incoming slide never flashes in place: it glides in over the outgoing one, which
  // keeps playing and drifts left at a third of the speed (parallax), then is paused and rewound for its next turn.
  useIsoLayoutEffect(() => {
    const from = prev.current;
    prev.current = active;
    if (from === active) return;
    const inEl = slideEls.current[active];
    const outEl = slideEls.current[from];
    if (reduced || !inEl || !outEl) return;
    [inEl, outEl].forEach((el) => el.getAnimations().forEach((a) => a.cancel()));
    inEl.animate([{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }], SLIDE);
    outEl
      .animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-33%)' }], { ...SLIDE, fill: 'forwards' })
      .finished.then(() => {
        const v = videos.current[from];
        if (!v) return;
        v.pause();
        v.currentTime = 0;
      }, () => {});
  }, [active, reduced]);

  // The active clip plays from its start (already rewound, so no seek on the way in).
  useEffect(() => {
    const v = videos.current[active];
    if (!v) return;
    if (v.currentTime > 0) v.currentTime = 0;
    v.play().catch(() => {});
  }, [active, reduced]);

  // only moves on from slide i, so a second timeupdate before the re-render can't skip a slide
  const leave = (i: number) => setActive((a) => (a === i ? (i + 1) % slides.length : a));
  // move on while the clip still has LEAD seconds to run; `ended` is the fallback for short clips
  const onTime = (i: number, v: HTMLVideoElement) => {
    if (v.duration - v.currentTime <= LEAD) leave(i);
  };

  return (
    <>
      <div className="hero-video" data-hero-video>
        {slides.map((s, i) => (
          <div
            key={s.src}
            ref={(el) => {
              slideEls.current[i] = el;
            }}
            className={`hero-slide${i === active ? ' is-active' : ''}`}
            aria-hidden="true"
          >
            {reduced ? (
              <img className="cover" src={s.poster} alt="" />
            ) : (
              <video
                ref={(el) => {
                  videos.current[i] = el;
                }}
                className="cover"
                src={s.src}
                poster={s.poster}
                muted
                playsInline
                preload="auto"
                onTimeUpdate={i === active ? (e) => onTime(i, e.currentTarget) : undefined}
                onEnded={i === active ? () => leave(i) : undefined}
              />
            )}
            {s.tint ? <div className="hero-slide-tint" style={{ opacity: s.tint }} /> : null}
          </div>
        ))}
        {children}
      </div>

      <div className="hero-dots" data-hero-dots role="group" aria-label={copy.hero.slides.label}>
        {slides.map((s, i) => (
          <button
            key={s.src}
            type="button"
            className="hero-dot"
            aria-label={`${copy.hero.slides.item} ${i + 1} of ${slides.length}`}
            aria-current={i === active ? 'true' : undefined}
            onClick={() => setActive(i)}
          />
        ))}
      </div>
    </>
  );
}
