'use client';

import { useRef } from 'react';
import { copy } from '@/config/copy';
import { sceneWith } from '@/config/scenes';
import { useScene } from '@/hooks/useScene';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { scrubDriver } from '@/lib/media';
import { Kicker } from '../ui/Kicker';
import { ScrubVideo } from '../ui/ScrubVideo';

const { s, media } = sceneWith('network', 'scrub');

/** S3 · 03 Network: the aerial clip scrubs from one truck up to the whole lit-up region. */
export function Network() {
  const ref = useRef<HTMLElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const reduced = usePrefersReducedMotion();
  useScene(ref, s, { driver: scrubDriver(vid) });
  const c = copy.network;

  return (
    <section ref={ref} id="network" className="scene network dark" aria-labelledby="network-title">
      <ScrubVideo media={media} videoRef={vid} reduced={reduced} />
      <div className="network-shade" aria-hidden="true" />
      <div className="network-copy">
        <div data-net-title>
          <Kicker light>{c.kicker}</Kicker>
          <h2 id="network-title" className="h2">
            {c.title}
          </h2>
        </div>
        <p className="net-body" data-net-body>
          {c.body}
        </p>
        {/* bottom-right of the footage; between title and body on phones */}
        <div className="net-counter" data-meter="orders" data-net-meter>
          <b>
            <span data-val>0.0</span>
            <span className="net-unit">K</span>
          </b>
          <small>{c.meterLabel}</small>
        </div>
      </div>
    </section>
  );
}
