'use client';

import { useRef } from 'react';
import { copy } from '@/config/copy';
import { sceneWith } from '@/config/scenes';
import { useFrameBox } from '@/hooks/useFrameBox';
import { useScene } from '@/hooks/useScene';
import { nn } from '@/lib/format';
import { frameSeq } from '@/lib/media';
import { ph } from '@/lib/ph';
import { Kicker } from '../ui/Kicker';
import { Meter } from '../ui/Meter';

const { s, media } = sceneWith('detect', 'frames');

/** S1 · 02 Detect: the parcel-handling frames scrub on a canvas while four checks take turns. */
export function Detect() {
  const ref = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  useScene(ref, s, {
    driver: ({ mobile }) => (canvas.current ? frameSeq(canvas.current, media.dir, media.count, mobile ? 2 : 1) : undefined),
  });

  useFrameBox(stage);
  const c = copy.detect;

  return (
    <section ref={ref} id="detect" className="scene detect" aria-labelledby="detect-title">
      <div className="detect-head" data-detect-head>
        <Kicker>{c.kicker}</Kicker>
        <h2 id="detect-title" className="h2">
          {c.title}
        </h2>
      </div>

      <div ref={stage} className="truck-box detect-stage" data-detect-canvas aria-hidden="true">
        <img src={media.poster} alt="" />
        <canvas ref={canvas} />
      </div>

      <ol className="detect-cards">
        {c.cards.map((card, i) => (
          <li key={card.t} className="dcard" data-card={i}>
            <div className="dcard-body">
              <span className="dcard-step">
                Check {nn(i + 1)} / {nn(c.cards.length)}
              </span>
              <h3>{card.t}</h3>
              <p>{ph(card.b)}</p>
              <Meter id={card.meter.id} label={card.meter.label} start={card.meter.start} />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
