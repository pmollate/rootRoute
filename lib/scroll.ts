import Lenis from 'lenis';
import { SMOOTH_SCROLL } from '@/config/scenes';
import { gsap, ScrollTrigger } from './gsap';

/** Lenis smooth scroll driven by the GSAP ticker, so pins and scrubs share one clock. */
export function initSmoothScroll(): () => void {
  const lenis = new Lenis({ ...SMOOTH_SCROLL, anchors: true });
  lenis.on('scroll', ScrollTrigger.update);
  const tick = (time: number) => lenis.raf(time * 1000);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);
  return () => {
    gsap.ticker.remove(tick);
    lenis.destroy();
  };
}
