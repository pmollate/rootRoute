'use client';

import { useRef } from 'react';
import { BRAND, copy } from '@/config/copy';
import { scene } from '@/config/scenes';
import { useScene } from '@/hooks/useScene';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { videoScrub } from '@/lib/media';
import { Meter } from '../Meter';
import { ScrubVideo } from '../ScrubVideo';

const s = scene('deliver');
const media = s.media as Extract<NonNullable<typeof s.media>, { kind: 'scrub' }>;

/**
 * 05 Deliver, which is also the page footer. The frame opens to full-bleed and the clip scrubs
 * from the truck's arrival up to the sky with the on-time card on screen; on the clip's last
 * frame the card gives way to the footer CTA and links.
 */
export function Deliver() {
  const ref = useRef<HTMLElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const reduced = usePrefersReducedMotion();
  useScene(ref, s, { driver: () => (vid.current ? videoScrub(vid.current) : undefined) });
  const c = copy.deliver;
  const f = copy.footer;

  return (
    <footer ref={ref} id="deliver" className="scene deliver" aria-labelledby="footer-title">
      <div className="deliver-frame" data-deliver-frame>
        <ScrubVideo media={media} videoRef={vid} reduced={reduced} still="/media/fulfill-2-end.webp" />
        <div className="deliver-shade" data-deliver-shade aria-hidden="true" />
      </div>

      <div className="deliver-card" data-deliver-card>
        <p className="h2">{c.title}</p>
        <Meter id="ontime" label={c.meterLabel} start="86%" size="lg" />
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

      <div className="deliver-base" data-deliver-base>
        <nav className="deliver-links" aria-label="Footer">
          <span className="deliver-mark">{BRAND.toUpperCase()}</span>
          {f.links.map((l) => (
            <a key={l.label} href={l.href}>
              {l.label}
            </a>
          ))}
        </nav>
        <p className="deliver-legal">© {new Date().getFullYear()} {BRAND}</p>
      </div>
    </footer>
  );
}
