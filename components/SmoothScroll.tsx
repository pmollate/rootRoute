'use client';

import { useEffect } from 'react';
import { ScrollTrigger } from '@/lib/gsap';
import { initSmoothScroll } from '@/lib/scroll';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

/** Lenis smooth scroll (off under reduced motion), plus a refresh once fonts and images settle. */
export function SmoothScroll() {
  const reduced = usePrefersReducedMotion();
  useEffect(() => (reduced ? undefined : initSmoothScroll()), [reduced]);
  useEffect(() => {
    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener('load', refresh);
    void document.fonts?.ready.then(refresh);
    return () => window.removeEventListener('load', refresh);
  }, []);
  return null;
}
