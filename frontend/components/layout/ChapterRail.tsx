'use client';

import { useEffect, useState } from 'react';
import { copy } from '@/config/copy';
import { chapter } from '@/lib/chapter';
import { nn } from '@/lib/format';
import { ScrollTrigger } from '@/lib/gsap';
import { RouteSpine } from './RouteSpine';

/** Chapter rail and route spine (right edge), shown while the film chapters are on screen. */
export function ChapterRail() {
  const [current, setCurrent] = useState(chapter.get());
  const [on, setOn] = useState(false);

  useEffect(() => chapter.sub(setCurrent), []);

  useEffect(() => {
    // Visible through the film chapters; Results and People sit between Optimize and Deliver, the footer after it.
    const active = [false, false];
    const toggle = (i: number) => (self: ScrollTrigger) => {
      active[i] = self.isActive;
      setOn(active[0] || active[1]);
    };
    const film = ScrollTrigger.create({
      start: () => window.innerHeight * 0.6, // hero p ≈ 0.4: its copy has faded
      endTrigger: '#results',
      end: 'top 70%',
      onToggle: toggle(0),
    });
    const deliver = ScrollTrigger.create({ trigger: '#deliver', start: 'top 60%', end: 'bottom 40%', onToggle: toggle(1) });
    return () => {
      film.kill();
      deliver.kill();
    };
  }, []);

  return (
    <div className={`chapters ${on ? '' : 'is-away'}`}>
      <RouteSpine />
      <nav className="rail" aria-label="Chapters">
        {copy.chapters.map((c, i) => (
          <a key={c.id} href={`#${c.id}`} className={i + 1 === current ? 'on' : ''} aria-label={`${nn(i + 1)} ${c.name}`}>
            <span className="rail-label">{c.name}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
