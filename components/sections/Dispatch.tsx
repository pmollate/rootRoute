'use client';

import { useRef } from 'react';
import { copy } from '@/config/copy';
import { scene } from '@/config/scenes';
import { useFrameBox } from '@/hooks/useFrameBox';
import { useScene } from '@/hooks/useScene';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { gsap } from '@/lib/gsap';
import { HeroGlobe } from '../HeroGlobe';
import { Kicker } from '../Kicker';

const s = scene('dispatch');
const media = s.media as Extract<NonNullable<typeof s.media>, { kind: 'loop' }>;

/** S0 · 01 Dispatch: the depot clip loops; scroll frames it, fades the copy and raises the truck for S1. */
export function Dispatch() {
  const ref = useRef<HTMLElement>(null);
  const truck = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  // S1 sits underneath with the same final frame; hide the hero once its pin releases so it never scrolls over S1.
  useScene(ref, s, {
    trigger: ({ root }) => ({
      onLeave: () => gsap.set(root, { autoAlpha: 0 }),
      onEnterBack: () => gsap.set(root, { autoAlpha: 1 }),
    }),
  });
  useFrameBox(truck); // matches the dark-mode spotlight to S1, which takes over this frame
  const c = copy.hero;

  return (
    <section ref={ref} id="dispatch" className="scene hero" aria-labelledby="hero-title">
      <div className="hero-video" data-hero-video>
        {reduced ? (
          <img className="cover" src={media.poster} alt="" />
        ) : (
          <video className="cover" src={media.src} poster={media.poster} autoPlay muted loop playsInline preload="auto" aria-hidden="true" />
        )}
        <div className="hero-shade" />
        <div className="hero-dim" data-hero-dim />
      </div>

      <div className="hero-copy" data-hero-copy>
        <Kicker light>{c.kicker}</Kicker>
        <h1 id="hero-title" className="display">
          {c.title}
        </h1>
        <p className="lede">{c.body}</p>
        <div className="ctas">
          <a className="btn btn-primary" href={c.primary.href}>
            {c.primary.label}
          </a>
          <a className="btn btn-glass" href={c.secondary.href}>
            {c.secondary.label}
          </a>
        </div>
        <p className="note">{c.note}</p>
      </div>

      <div className="hero-globe" data-hero-globe aria-hidden="true">
        <HeroGlobe />
      </div>

      <div ref={truck} className="truck-box hero-truck" data-hero-truck aria-hidden="true">
        <img src="/media/truck-front34.webp" alt="" />
      </div>
      <p className="hero-handoff" data-hero-handoff aria-hidden="true">
        <span>{c.handoff.step}</span> {c.handoff.line}
      </p>
    </section>
  );
}
