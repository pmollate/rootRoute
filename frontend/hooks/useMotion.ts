import type { RefObject } from 'react';
import { MOTION_OK_QUERY } from '@/config/scenes';
import { useIsoLayoutEffect } from '@/hooks/useIsoLayoutEffect';
import { gsap } from '@/lib/gsap';

/**
 * Runs `setup` (tweens, ScrollTriggers) scoped to `ref`, only when the viewer has no reduced-motion
 * preference. Everything it creates is reverted on unmount or when that preference changes.
 */
export function useMotion(ref: RefObject<HTMLElement | null>, setup: (root: HTMLElement) => void) {
  useIsoLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const mm = gsap.matchMedia();
    mm.add(MOTION_OK_QUERY, () => setup(root), root);
    return () => mm.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
