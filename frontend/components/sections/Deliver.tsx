'use client';

import { useRef } from 'react';
import { copy } from '@/config/copy';
import { sceneWith } from '@/config/scenes';
import { useScene } from '@/hooks/useScene';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { scrubDriver } from '@/lib/media';
import { Meter } from '../ui/Meter';
import { ScrubVideo } from '../ui/ScrubVideo';

const { s, media } = sceneWith('deliver', 'scrub');

/**
 * 05 Deliver, the film's last chapter. The frame opens to full-bleed and the clip scrubs from the
 * truck's arrival up to the sky with the on-time card on screen; on the clip's last frame the card
 * gives way to the closing call to action. The page footer (SiteFooter) follows.
 */
export function Deliver() {
  const ref = useRef<HTMLElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const reduced = usePrefersReducedMotion();
  useScene(ref, s, { driver: scrubDriver(vid) });
  const c = copy.deliver;
  const f = copy.footer;

  return (
    <section ref={ref} id="deliver" className="scene deliver" aria-labelledby="footer-title">
      <div className="deliver-frame" data-deliver-frame>
        <ScrubVideo media={media} videoRef={vid} reduced={reduced} still="/media/fulfill-2-end.webp" />
        <div className="deliver-shade" data-deliver-shade aria-hidden="true" />
      </div>

      <div className="deliver-card" data-deliver-card>
        <p className="h2">{c.title}</p>
        <Meter id="ontime" label={c.meterLabel} start="71.0%" size="lg" />
      </div>

      <div className="deliver-cta" data-deliver-cta>
        <h2 id="footer-title" className="deliver-cta-title">
          {f.title}
        </h2>
        <p className="deliver-cta-body">{f.body}</p>
        <a className="btn btn-primary" href={f.cta.href}>
          {f.cta.label}
        </a>
      </div>

    </section>
  );
}
