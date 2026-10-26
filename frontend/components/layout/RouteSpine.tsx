'use client';

import { useEffect, useRef } from 'react';
import { ScrollTrigger } from '@/lib/gsap';

/** Route line through the chapter rail; draws from the end of the hero to the bottom of the page. */
export function RouteSpine() {
  const line = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const st = ScrollTrigger.create({
      trigger: '#detect',
      start: 'top 80%',
      end: 'max',
      onUpdate: ({ progress }) => line.current && (line.current.style.transform = `scaleY(${progress})`),
    });
    return () => st.kill();
  }, []);
  return (
    <div className="spine" aria-hidden="true">
      <span ref={line} />
    </div>
  );
}
