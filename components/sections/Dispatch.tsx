'use client';

import { useRef } from 'react';
import { copy } from '@/config/copy';
import { scene } from '@/config/scenes';
import { useScene } from '@/hooks/useScene';
import { gsap } from '@/lib/gsap';
import { HeroGlobe } from '../HeroGlobe';
import { HeroSlides } from '../HeroSlides';
import { Kicker } from '../Kicker';

const s = scene('dispatch');
const media = s.media as Extract<NonNullable<typeof s.media>, { kind: 'slides' }>;

/** S0 · 01 Dispatch: the depot clips play in turn; scroll frames it and fades the copy for S1. */
export function Dispatch() {
  const ref = useRef<HTMLElement>(null);
  // S1 sits underneath; hide the hero once its pin releases so it never scrolls over S1.
  useScene(ref, s, {
    trigger: ({ root }) => ({
      onLeave: () => gsap.set(root, { autoAlpha: 0 }),
      onEnterBack: () => gsap.set(root, { autoAlpha: 1 }),
    }),
  });
  const c = copy.hero;

  return (
    <section ref={ref} id="dispatch" className="scene hero" aria-labelledby="hero-title">
      <HeroSlides slides={media.slides}>
        <div className="hero-shade" />
        <div className="hero-dim" data-hero-dim />
      </HeroSlides>

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

      <p className="hero-handoff" data-hero-handoff aria-hidden="true">
        <span>{c.handoff.step}</span> {c.handoff.line}
      </p>
    </section>
  );
}
