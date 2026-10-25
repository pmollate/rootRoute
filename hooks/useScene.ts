import { useEffect, type RefObject } from 'react';
import { MOBILE_QUERY, MOBILE_SCROLL, type Scene } from '@/config/scenes';
import { useIsoLayoutEffect } from '@/hooks/useIsoLayoutEffect';
import { chapter } from '@/lib/chapter';
import { gsap, type ScrollTrigger } from '@/lib/gsap';
import { group, lerp, local } from '@/lib/math';
import type { Driver } from '@/lib/media';

type Ctx = { root: HTMLElement; mobile: boolean };

export type SceneOptions = {
  /** media driver, created per breakpoint; omitted under reduced motion */
  driver?: (c: Ctx) => Driver | undefined;
  /** extra tweens on the scene timeline (0–1 = the scene's scroll) */
  build?: (tl: gsap.core.Timeline, c: Ctx) => void;
  onProgress?: (p: number, c: Ctx) => void;
  /** override the scene's pin per breakpoint (e.g. S4 stacks vertically on mobile) */
  pin?: (c: Ctx) => boolean;
  /** extra ScrollTrigger callbacks (onLeave, onEnterBack, …) */
  trigger?: (c: Ctx) => ScrollTrigger.Vars;
};

/**
 * Wires one scene from config/scenes.ts: pins it for `scroll` vh, scrubs its beats, writes its
 * [data-meter] numbers and bars, seeks its media and sets the chapter on the rail.
 * Reduced motion: no pin, no media, meters at their final values.
 */
export function useScene(ref: RefObject<HTMLElement | null>, s: Scene, opts: SceneOptions = {}) {
  useIsoLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const meters = (s.meters ?? []).map((m) => ({
      m,
      val: root.querySelector<HTMLElement>(`[data-meter="${m.id}"] [data-val]`),
      bar: root.querySelector<HTMLElement>(`[data-meter="${m.id}"] [data-bar]`),
    }));
    const setMeters = (p: number) =>
      meters.forEach(({ m, val, bar }) => {
        const v = lerp(m.from, m.to, local(p, m.at));
        if (val) val.textContent = group(v.toFixed(m.decimals ?? 0)) + (m.unit ?? '');
        if (bar) bar.style.transform = `scaleX(${v / (m.max ?? 100)})`;
      });

    const mm = gsap.matchMedia();
    // `all` always matches: matchMedia only runs the callback when at least one condition is true.
    mm.add({ all: 'all', reduce: '(prefers-reduced-motion: reduce)', mobile: MOBILE_QUERY }, (mc) => {
      const { reduce, mobile } = mc.conditions as { reduce: boolean; mobile: boolean };
      if (reduce) {
        setMeters(1);
        return;
      }
      const c: Ctx = { root, mobile };
      const driver = opts.driver?.(c);
      const scroll = s.scroll * (mobile ? MOBILE_SCROLL : 1);

      // Start fetching media when the scene is within one viewport of the screen.
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            driver?.load?.();
            io.disconnect();
          }
        },
        { rootMargin: '100% 0px' },
      );
      io.observe(root);

      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: root,
          start: 'top top',
          end: `+=${scroll}%`,
          pin: opts.pin ? opts.pin(c) : s.pin,
          scrub: 0.6,
          invalidateOnRefresh: true,
          ...opts.trigger?.(c),
          onUpdate: ({ progress: p }) => {
            driver?.seek(s.mediaAt ? local(p, s.mediaAt) : p);
            setMeters(p);
            opts.onProgress?.(p, c);
            if (s.chapter) chapter.set(s.chapter);
          },
        },
      });
      // A later beat on the same target must not paint its from-state over the first one's.
      const seen = new Set<string>();
      s.beats?.forEach((b) => {
        const immediateRender = !seen.has(b.target);
        seen.add(b.target);
        tl.fromTo(b.target, { ...b.from, immediateRender }, { ...b.to, duration: b.at[1] - b.at[0] }, b.at[0]);
      });
      opts.build?.(tl, c);
      tl.set({}, {}, 1); // timeline always spans exactly 0–1
      setMeters(0);
      opts.onProgress?.(0, c);

      return () => {
        io.disconnect();
        driver?.kill?.();
      };
    }, root);

    return () => mm.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);
}

/** True once `ref` is within one viewport of the screen; used to defer heavy media. */
export function useNear(ref: RefObject<HTMLElement | null>, onNear: () => void) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          onNear();
          io.disconnect();
        }
      },
      { rootMargin: '100% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
