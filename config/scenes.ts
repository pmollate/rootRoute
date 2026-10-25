/**
 * Single source of truth for scroll motion (plan §5). Progress p runs 0–1 across each scene's
 * scroll length; beats and meters are placed on that 0–1 line. No copy lives here.
 * Media files come from scripts/process-media.sh.
 */
import type gsap from 'gsap';

export type Range = [number, number];
export type Beat = { at: Range; target: string; from: gsap.TweenVars; to: gsap.TweenVars };
export type Meter = { id: string; from: number; to: number; at: Range; unit?: string; decimals?: number; max?: number };
export type Media =
  | { kind: 'loop'; src: string; poster: string }
  | { kind: 'scrub'; src: string; mobileSrc?: string; poster: string }
  | { kind: 'frames'; dir: string; count: number; poster: string }
  | { kind: 'cards'; srcs: string[]; posters: string[] };

export type Scene = {
  id: string;
  /** film chapter shown on the rail while this scene is pinned */
  chapter?: 1 | 2 | 3 | 4 | 5;
  scroll: number; // vh
  pin: boolean;
  media?: Media;
  /** part of the scroll (0–1) the media plays across; it holds its last frame after */
  mediaAt?: Range;
  meters?: Meter[];
  beats?: Beat[];
};

/** Scroll lengths are multiplied by this below MOBILE_QUERY. */
export const MOBILE_SCROLL = 0.6;
export const MOBILE_QUERY = '(max-width: 768px)';

/** Lenis smooth scroll: higher lerp = snappier. */
export const SMOOTH_SCROLL = { lerp: 0.11, wheelMultiplier: 1, touchMultiplier: 1.4 };

const q = (i: number): Range => [i * 0.25, i * 0.25 + 0.25];

export const scenes: Scene[] = [
  {
    // hero.mp4: truck idling at the night depot, loops while the overlays move.
    id: 'dispatch', chapter: 1, scroll: 150, pin: true,
    media: { kind: 'loop', src: '/media/dispatch-loop.mp4', poster: '/media/dispatch-poster.webp' },
    beats: [
      { at: [0, 0.4], target: '[data-hero-video]', from: { clipPath: 'inset(0% 0% 0% 0% round 0px)' }, to: { clipPath: 'inset(10% 6% 28% 6% round 14px)' } },
      { at: [0, 0.4], target: '[data-hero-copy]', from: { yPercent: 0, autoAlpha: 1 }, to: { yPercent: -40, autoAlpha: 0 } },
      { at: [0, 0.3], target: '[data-hero-globe]', from: { autoAlpha: 1, scale: 1 }, to: { autoAlpha: 0, scale: 0.8 } },
      { at: [0.3, 0.8], target: '[data-hero-dim]', from: { autoAlpha: 0 }, to: { autoAlpha: 0.3 } },
      { at: [0.3, 0.8], target: '[data-hero-truck]', from: { yPercent: 80, scale: 0.85, autoAlpha: 0 }, to: { yPercent: 0, scale: 1, autoAlpha: 1 } },
      { at: [0.8, 1], target: '[data-hero-video]', from: { autoAlpha: 1 }, to: { autoAlpha: 0 } },
      { at: [0.8, 1], target: '[data-hero-handoff]', from: { autoAlpha: 0, y: 20 }, to: { autoAlpha: 1, y: 0 } },
    ],
  },
  {
    // orbit.mp4: studio turntable, front 3/4 → side → rear 3/4, one beat per quarter.
    id: 'detect', chapter: 2, scroll: 400, pin: true,
    media: { kind: 'frames', dir: '/media/inspect', count: 240, poster: '/media/inspect/0001.webp' },
    meters: [
      { id: 'late', from: 34, to: 6, at: [0.04, 0.2], unit: '%' },
      { id: 'addr', from: 72, to: 100, at: [0.29, 0.45], unit: '%' },
      { id: 'dist', from: 1840, to: 210, at: [0.54, 0.7], unit: ' km', max: 1840 },
      { id: 'cutoff', from: 81, to: 99, at: [0.79, 0.95], unit: '%' },
    ],
    beats: [
      ...[0, 1, 2, 3].flatMap((i) => {
        const [a, b] = q(i);
        const inB: Beat = { at: [a, a + 0.02], target: `[data-card="${i}"]`, from: { autoAlpha: 0, y: 40 }, to: { autoAlpha: 1, y: 0 } };
        const outB: Beat = { at: [b - 0.02, b], target: `[data-card="${i}"]`, from: { autoAlpha: 1, y: 0 }, to: { autoAlpha: 0, y: -40 } };
        // the same number, painted on the truck's box side
        const numIn: Beat = { at: [a, a + 0.03], target: `[data-decal="${i}"]`, from: { autoAlpha: 0 }, to: { autoAlpha: 1 } };
        const numOut: Beat = { at: [b - 0.03, b], target: `[data-decal="${i}"]`, from: { autoAlpha: 1 }, to: { autoAlpha: 0 } };
        return i === 3 ? [inB, numIn] : [inB, outB, numIn, numOut];
      }),
      { at: [0, 0.03], target: '[data-detect-head]', from: { autoAlpha: 0, y: 24 }, to: { autoAlpha: 1, y: 0 } },
      // S1 → S2: the canvas hands over to the drive rig
      { at: [0.95, 1], target: '[data-detect-canvas]', from: { autoAlpha: 1 }, to: { autoAlpha: 0 } },
    ],
  },
  { id: 'drive', scroll: 100, pin: false },
  {
    // aerial rise.mp4: top-down truck, camera rises to the lit-up city.
    id: 'network', chapter: 3, scroll: 250, pin: true,
    media: { kind: 'scrub', src: '/media/scale-scrub.mp4', mobileSrc: '/media/scale-scrub-m.mp4', poster: '/media/scale-poster.webp' },
    meters: [{ id: 'orders', from: 0, to: 1.2, at: [0.1, 0.9], decimals: 1 }], // the "M" is styled separately in Network.tsx
    beats: [
      { at: [0, 0.15], target: '[data-net-title]', from: { autoAlpha: 0, y: 30 }, to: { autoAlpha: 1, y: 0 } },
      { at: [0.1, 0.2], target: '[data-net-meter]', from: { autoAlpha: 0 }, to: { autoAlpha: 1 } },
      { at: [0.12, 0.27], target: '[data-net-body]', from: { autoAlpha: 0, y: 20 }, to: { autoAlpha: 1, y: 0 } },
    ],
  },
  {
    // connect.mp4 / Decide.mp4 / Learn.mp4: warehouse → robot arm → trucks leaving the dock.
    id: 'optimize', chapter: 4, scroll: 300, pin: true,
    media: {
      kind: 'cards',
      srcs: ['/media/fulfill-1a.mp4', '/media/fulfill-1b.mp4', '/media/fulfill-1c.mp4'],
      posters: ['/media/fulfill-1a.webp', '/media/fulfill-1b.webp', '/media/fulfill-1c.webp'],
    },
    meters: [
      { id: 'feeds', from: 0, to: 100, at: [0.05, 0.3], unit: '%' },
      { id: 'decision', from: 900, to: 40, at: [0.38, 0.62], unit: ' ms', max: 900 },
      { id: 'forecast', from: 80, to: 97, at: [0.7, 0.95], unit: '%' },
    ],
  },
  {
    // footer.mp4: truck arrives, doorstep handoff, camera tilts up to the sky. This is the page
    // footer: the card rides along while the clip plays; on its last frame the footer takes over.
    id: 'deliver', chapter: 5, scroll: 260, pin: true,
    media: { kind: 'scrub', src: '/media/fulfill-2-scrub.mp4', mobileSrc: '/media/fulfill-2-scrub-m.mp4', poster: '/media/fulfill-2-poster.webp' },
    mediaAt: [0, 0.78],
    meters: [{ id: 'ontime', from: 86, to: 99, at: [0.1, 0.75], unit: '%' }],
    beats: [
      { at: [0, 0.2], target: '[data-deliver-frame]', from: { clipPath: 'inset(18% 22% 18% 22% round 14px)' }, to: { clipPath: 'inset(0% 0% 0% 0% round 0px)' } },
      { at: [0.08, 0.16], target: '[data-deliver-card]', from: { autoAlpha: 0, y: 40 }, to: { autoAlpha: 1, y: 0 } },
      // last frame reached (mediaAt ends at 0.78): the card hands over to the footer
      { at: [0.78, 0.84], target: '[data-deliver-card]', from: { autoAlpha: 1, y: 0 }, to: { autoAlpha: 0, y: -30 } },
      { at: [0.78, 0.9], target: '[data-deliver-shade]', from: { autoAlpha: 0 }, to: { autoAlpha: 1 } },
      { at: [0.82, 0.92], target: '[data-deliver-cta]', from: { autoAlpha: 0, y: 30 }, to: { autoAlpha: 1, y: 0 } },
      { at: [0.86, 0.94], target: '[data-deliver-base]', from: { autoAlpha: 0 }, to: { autoAlpha: 1 } },
    ],
  },
];

export const scene = (id: string) => {
  const s = scenes.find((x) => x.id === id);
  if (!s) throw new Error(`No scene "${id}" in config/scenes.ts`);
  return s;
};
