import { useEffect, type RefObject } from 'react';
import { FRAME_H, FRAME_W } from '@/lib/decal';

/**
 * Measures where the 1600×900 turntable frame sits inside a `.truck-box` (object-fit: contain) and
 * exposes it as CSS variables: --decal-k (scale), --frame-w and --frame-h. The box-side numbers and
 * the dark-mode spotlight mask are sized from these, so they always match the picture.
 */
export function useFrameBox(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const k = Math.min(el.clientWidth / FRAME_W, el.clientHeight / FRAME_H);
      el.style.setProperty('--decal-k', String(k));
      el.style.setProperty('--frame-w', `${k * FRAME_W}px`);
      el.style.setProperty('--frame-h', `${k * FRAME_H}px`);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
}
