import { useEffect, type RefObject } from 'react';

/** /media/inspect frame size (scripts/process-media.sh scales them to 1600 wide) */
const FRAME_W = 1600;
const FRAME_H = 900;

/**
 * Measures where the 1600×900 frame sits inside a `.truck-box` (object-fit: contain) and exposes
 * its size as CSS variables --frame-w and --frame-h. The dark-mode spotlight mask is sized from
 * these, so it always matches the picture.
 */
export function useFrameBox(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const k = Math.min(el.clientWidth / FRAME_W, el.clientHeight / FRAME_H);
      el.style.setProperty('--frame-w', `${k * FRAME_W}px`);
      el.style.setProperty('--frame-h', `${k * FRAME_H}px`);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
}
