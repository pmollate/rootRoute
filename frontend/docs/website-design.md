## 1. Master timeline

| # | Section | Chapter | Clip | Playback mode | Scroll length | Theme |
|---|---|---|---|---|---|---|
| S0 | Hero | 01 Dispatch | `dispatch` (V1) | Loops continuously; the scroll animates the overlays around it | 150vh, pinned | Video |
| S1 | Detect | 02 Detect | `inspect` (V2) | Frame sequence drawn on a canvas, scrubbed by scroll | 400vh, pinned | `--bg` |
| S2 | Drive | 02→03 | None (truck rig with separate wheel images) | Scroll-driven motion | 100vh | `--bg` → `--dark` |
| S3 | Network | 03 Network | `scale` (V3) | Video scrubbed by scroll | 250vh, pinned | `--dark` |
| S4 | How it works | 04 Optimize | `fulfill-1` (V4a, V4b, V4c) | One clip per card; plays when the card becomes active | 300vh, horizontal | `--bg` |
| S5 | Delivered | 05 Deliver | `fulfill-2` (V5) | Video scrubbed by scroll, with a clip-path reveal | 200vh, pinned | Video |
| S6 | Results | 05 (held) | None | Numbers count up | 120vh | `--dark` |
| S7 | Built for people | 05 (held) | None | 3D tilt cards | Auto | `--surface` on `--bg` |
| S8 | Footer | 05 (held) | Final frame of `fulfill-2` as a still | Static | Auto | `--dark` |

**Story continuity:**
- The truck leaves the depot (S0).
- It is inspected (S1), drives out (S2), and becomes one route among 1.2M (S3).
- The warehouse loads the next truck (S4).
- The truck arrives at the door (S5).
- The proof follows (S6–S8).

Each clip's last frame visually sets up the next section.

## 2. Live readout values per chapter

Values interpolate within each chapter, so the numbers never jump.

| Chapter | Status line | On-time | Km saved |
|---|---|---|---|
| 01 Dispatch | Order received · planning route | 71 → 71 | 0 → 0 |
| 02 Detect | Scanning lanes, addresses and cutoffs | 71 → 84 | 0 → 380 |
| 03 Network | Balancing the whole network | 84 → 90 | 380 → 760 |
| 04 Optimize | Best route locked in | 90 → 95 | 760 → 1,000 |
| 05 Deliver | Out for delivery · on time | 95 → 99 | 1,000 → 1,240 |

## 3. Beat sheets

Progress `p` runs 0 to 1 across each section's scroll length. Clip time = `p × duration`.

**S0 Dispatch (`dispatch` loops the whole time)**

| p | Video | Content | Readout |
|---|---|---|---|
| 0 | Full-bleed loop | Kicker, headline, subhead, note, both CTAs | 01, 71%, 0 km |
| 0–0.4 | `clip-path` insets to a rounded frame (inset 10% 6% 28% 6%) | Headline moves up 40% and fades out | — |
| 0.3–0.8 | Frame dims to 70% | `truck-front34` rises from below (scale .85→1) | — |
| 0.8–1 | Fades to `--bg` | Route spine starts drawing | — |

**S1 Detect (`inspect` frames, 4 beats)**

| p | Truck angle | Card on screen | Meter |
|---|---|---|---|
| 0–0.25 | Front 3/4 | 01 The right carrier for every lane | Late risk 34% → 6% |
| 0.25–0.5 | Turning | 02 Bad addresses fixed at checkout | Addresses verified 72% → 100% |
| 0.5–0.75 | Side profile | 03 Shipped from the closest stock | Distance to customer 1840 → 210 km |
| 0.75–1 | Rear 3/4 | 04 Promises that respect every cutoff | Cutoff orders 81% → 99% |

Within each beat:
- The card fades in over the first 8%.
- The meter animates during the middle 60%.
- The card fades out over the last 8%. The last card stays on screen.
- A large outlined index number (01–04) sits behind the card in `--line`.

**S2 Drive (no clip)**

| p | Truck | Background |
|---|---|---|
| 0–1 | Truck body plus separate wheel images moves from -120% to 120% along x; wheels rotate with scroll velocity | A `--dark` panel wipes in behind the truck's rear, following it |

**S3 Network (`scale` scrubbed)**

| p | Clip | Content | Readout |
|---|---|---|---|
| 0–0.15 | Single truck from above | "One brain for your whole network." fades up | 03 |
| 0.1–0.9 | Camera rises over the city to the region | Counter 0.0M → 1.2M | 84→90%, 380→760 km |
| 0.9–1 | Orange route glowing | Body line fades in | — |

**S4 Optimize (`fulfill-1`, horizontal track)**

| Card active | Clip | Copy | Meter |
|---|---|---|---|
| 1 | V4a, loops | Connect | Data feeds live 0% → 100% |
| 2 | V4b, loops | Decide | Decision time 900 ms → 40 ms |
| 3 | V4c, plays once and holds its last frame | Learn | Forecast accuracy 80% → 97% |

- Outlined "ROOT ROUTE" text moves at 0.3× the track speed.
- Inactive cards sit at scale 0.92 and 50% opacity.

**S5 Deliver (`fulfill-2` scrubbed)**

| p | Clip | Content | Readout |
|---|---|---|---|
| 0–0.25 | `clip-path` grows from card size to full-bleed; truck arrives | — | 05 |
| 0.25–0.6 | Doorstep handoff | — | 95→97% |
| 0.6–1 | Tilt up to the sky | "On time. Every route. Everywhere." + meter 86% → 99% on a `--glass` card | 97→99%, 1,240 km |

**S6 Results:** the 4 stats count up when the section enters. The security line fades in last.

**S7 Built for people:** 4 cards tilt in (rotateX 14° → 0°). `dashboard-mock` slides in from the right.

**S8 Footer:** the `fulfill-2` final frame sits behind a `--dark` gradient with the CTA.

## 4. Transitions between clips

| Between | Technique |
|---|---|
| S0 → S1 | The hero fades to `--bg`. The inspect canvas uses `mix-blend-mode: multiply`, so its off-white studio background blends into the page. |
| S1 → S2 | The canvas fades out at p 0.95 while the side-profile truck rig enters from the left. |
| S2 → S3 | The dark panel wipe pulled in by the truck; `scale` starts on its first frame (top-down truck). |
| S3 → S4 | The dark section shrinks with `clip-path: inset(... round 14px)` into the first card of S4. |
| S4 → S5 | V4c ends with trucks leaving and V5 starts with a truck arriving, so the story carries across the cut. |
| S5 → S6 | The warm sky fades into `--dark`. |

## 5. Single source of truth: `config/scenes.ts`

```ts
import type gsap from "gsap";

export type Range = [number, number];
export type Beat = { at: Range; target: string; from: gsap.TweenVars; to: gsap.TweenVars };
export type Meter = { id: string; from: number; to: number; at: Range; unit?: string; decimals?: number; max?: number };
export type Media =
  | { kind: "loop"; src: string; poster: string }
  | { kind: "scrub"; src: string; poster: string }
  | { kind: "frames"; dir: string; count: number; poster: string }
  | { kind: "cards"; srcs: string[]; once?: number[]; posters: string[] };

export type Scene = {
  id: string;
  chapter?: 1 | 2 | 3 | 4 | 5;
  scroll: number;               // vh
  pin: boolean;
  layout?: "vertical" | "horizontal";
  media?: Media;
  hud?: { status: string; onTime: Range; km: Range };
  meters?: Meter[];
  beats?: Beat[];
};

const q = (i: number): Range => [i * 0.25, i * 0.25 + 0.25];

export const scenes: Scene[] = [
  {
    id: "dispatch", chapter: 1, scroll: 150, pin: true,
    media: { kind: "loop", src: "/media/dispatch-loop.mp4", poster: "/media/dispatch-poster.webp" },
    hud: { status: "Order received · planning route", onTime: [71, 71], km: [0, 0] },
    beats: [
      { at: [0, 0.4], target: "[data-hero-video]", from: { clipPath: "inset(0% 0% 0% 0% round 0px)" }, to: { clipPath: "inset(10% 6% 28% 6% round 14px)" } },
      { at: [0, 0.4], target: "[data-hero-copy]", from: { yPercent: 0, autoAlpha: 1 }, to: { yPercent: -40, autoAlpha: 0 } },
      { at: [0.3, 0.8], target: "[data-hero-truck]", from: { yPercent: 80, scale: 0.85 }, to: { yPercent: 0, scale: 1 } },
      { at: [0.8, 1], target: "[data-hero-video]", from: { autoAlpha: 1 }, to: { autoAlpha: 0 } },
    ],
  },
  {
    id: "detect", chapter: 2, scroll: 400, pin: true,
    media: { kind: "frames", dir: "/media/inspect", count: 192, poster: "/media/inspect/0001.webp" },
    hud: { status: "Scanning lanes, addresses and cutoffs", onTime: [71, 84], km: [0, 380] },
    meters: [
      { id: "late",    from: 34,   to: 6,   at: [0.04, 0.2],  unit: "%" },
      { id: "addr",    from: 72,   to: 100, at: [0.29, 0.45], unit: "%" },
      { id: "dist",    from: 1840, to: 210, at: [0.54, 0.7],  unit: " km", max: 1840 },
      { id: "cutoff",  from: 81,   to: 99,  at: [0.79, 0.95], unit: "%" },
    ],
    beats: [0, 1, 2, 3].flatMap((i) => {
      const [a, b] = q(i);
      const inB: Beat = { at: [a, a + 0.02], target: `[data-card="${i}"]`, from: { autoAlpha: 0, y: 40 }, to: { autoAlpha: 1, y: 0 } };
      const outB: Beat = { at: [b - 0.02, b], target: `[data-card="${i}"]`, from: { autoAlpha: 1, y: 0 }, to: { autoAlpha: 0, y: -40 } };
      return i === 3 ? [inB] : [inB, outB];
    }),
  },
  { id: "drive", scroll: 100, pin: false },
  {
    id: "network", chapter: 3, scroll: 250, pin: true,
    media: { kind: "scrub", src: "/media/scale-scrub.mp4", poster: "/media/scale-poster.webp" },
    hud: { status: "Balancing the whole network", onTime: [84, 90], km: [380, 760] },
    meters: [{ id: "orders", from: 0, to: 1.2, at: [0.1, 0.9], unit: "M", decimals: 1 }],
    beats: [
      { at: [0, 0.15], target: "[data-net-title]", from: { autoAlpha: 0, y: 30 }, to: { autoAlpha: 1, y: 0 } },
      { at: [0.9, 1], target: "[data-net-body]", from: { autoAlpha: 0 }, to: { autoAlpha: 1 } },
    ],
  },
  {
    id: "optimize", chapter: 4, scroll: 300, pin: true, layout: "horizontal",
    media: { kind: "cards", srcs: ["/media/fulfill-1a.mp4", "/media/fulfill-1b.mp4", "/media/fulfill-1c.mp4"], once: [2],
             posters: ["/media/fulfill-1a.webp", "/media/fulfill-1b.webp", "/media/fulfill-1c.webp"] },
    hud: { status: "Best route locked in", onTime: [90, 95], km: [760, 1000] },
    meters: [
      { id: "feeds",    from: 0,   to: 100, at: [0.05, 0.3],  unit: "%" },
      { id: "decision", from: 900, to: 40,  at: [0.38, 0.62], unit: " ms", max: 900 },
      { id: "forecast", from: 80,  to: 97,  at: [0.7, 0.95],  unit: "%" },
    ],
  },
  {
    id: "deliver", chapter: 5, scroll: 200, pin: true,
    media: { kind: "scrub", src: "/media/fulfill-2-scrub.mp4", poster: "/media/fulfill-2-end.webp" },
    hud: { status: "Out for delivery · on time", onTime: [95, 99], km: [1000, 1240] },
    meters: [{ id: "ontime", from: 86, to: 99, at: [0.6, 0.9], unit: "%" }],
    beats: [
      { at: [0, 0.25], target: "[data-deliver-frame]", from: { clipPath: "inset(18% 22% 18% 22% round 14px)" }, to: { clipPath: "inset(0% 0% 0% 0% round 0px)" } },
      { at: [0.6, 0.75], target: "[data-deliver-card]", from: { autoAlpha: 0, y: 40 }, to: { autoAlpha: 1, y: 0 } },
    ],
  },
];
```

Copy stays in `copy.ts`. Sections render it and tag elements with `data-*` attributes, so the scene config never contains text.

## 6. Engine

**Readout store (`lib/hud-store.ts`)**
```ts
type Hud = { chapter: number; status: string; onTime: number; km: number };
let state: Hud = { chapter: 1, status: "", onTime: 71, km: 0 };
const subs = new Set<(h: Hud) => void>();
export const hud = {
  get: () => state,
  set: (p: Partial<Hud>) => { state = { ...state, ...p }; subs.forEach((f) => f(state)); },
  sub: (f: (h: Hud) => void) => (subs.add(f), () => subs.delete(f)),
};
```

**Helpers (`lib/math.ts`)**
```ts
export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const local = (p: number, [a, b]: [number, number]) => clamp((p - a) / (b - a));
```

**Media drivers (`lib/media.ts`)**
```ts
export type Driver = { seek: (p: number) => void; kill?: () => void };

export function videoScrub(v: HTMLVideoElement): Driver {
  v.pause(); let target = 0, raf = 0;
  const tick = () => { if (v.duration && Math.abs(v.currentTime - target) > 0.01) v.currentTime = target; raf = 0; };
  return { seek: (p) => { target = p * (v.duration || 0) * 0.999; if (!raf) raf = requestAnimationFrame(tick); } };
}

export function frameSeq(c: HTMLCanvasElement, dir: string, count: number): Driver {
  const ctx = c.getContext("2d")!;
  const imgs = Array.from({ length: count }, (_, i) => { const im = new Image(); im.decoding = "async";
    im.src = `${dir}/${String(i + 1).padStart(4, "0")}.webp`; return im; });
  let last = -1;
  const draw = (i: number) => { const im = imgs[i]; if (!im?.complete || i === last) return; last = i;
    ctx.clearRect(0, 0, c.width, c.height); ctx.drawImage(im, 0, 0, c.width, c.height); };
  imgs[0].onload = () => draw(0);
  return { seek: (p) => draw(Math.round(p * (count - 1))) };
}
```

**Scene hook (`hooks/useScene.ts`)**
```ts
import { useLayoutEffect, RefObject } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Scene } from "@/config/scenes";
import { hud } from "@/lib/hud-store";
import { lerp, local } from "@/lib/math";
import type { Driver } from "@/lib/media";
gsap.registerPlugin(ScrollTrigger);

export function useScene(ref: RefObject<HTMLElement>, s: Scene, getDriver?: () => Driver | undefined) {
  useLayoutEffect(() => {
    const root = ref.current!; const driver = getDriver?.();
    const meters = (s.meters ?? []).map((m) => ({ m,
      val: root.querySelector<HTMLElement>(`[data-meter="${m.id}"] [data-val]`),
      bar: root.querySelector<HTMLElement>(`[data-meter="${m.id}"] [data-bar]`) }));

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "none" }, scrollTrigger: {
        trigger: root, start: "top top", end: `+=${s.scroll}%`, pin: s.pin, scrub: 0.6,
        onUpdate: ({ progress: p }) => {
          driver?.seek(p);
          meters.forEach(({ m, val, bar }) => {
            const v = lerp(m.from, m.to, local(p, m.at));
            if (val) val.textContent = v.toFixed(m.decimals ?? 0).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (m.unit ?? "");
            if (bar) bar.style.transform = `scaleX(${v / (m.max ?? 100)})`;
          });
          if (s.hud && s.chapter) hud.set({ chapter: s.chapter, status: s.hud.status,
            onTime: Math.round(lerp(...s.hud.onTime, p)), km: Math.round(lerp(...s.hud.km, p)) });
        },
      }});
      s.beats?.forEach((b) => tl.fromTo(b.target, b.from, { ...b.to, duration: b.at[1] - b.at[0] }, b.at[0]));
      tl.set({}, {}, 1);
    }, root);
    return () => { ctx.revert(); driver?.kill?.(); };
  }, [s]);
}
```

**Section usage (S3 example)**
```tsx
"use client";
import { useRef } from "react";
import { scenes } from "@/config/scenes";
import { copy } from "@/config/copy";
import { useScene } from "@/hooks/useScene";
import { videoScrub } from "@/lib/media";

const scene = scenes.find((s) => s.id === "network")!;

export function Network() {
  const ref = useRef<HTMLElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  useScene(ref, scene, () => vid.current ? videoScrub(vid.current) : undefined);
  return (
    <section ref={ref} id="network" className="scene dark">
      <video ref={vid} src="/media/scale-scrub.mp4" poster="/media/scale-poster.webp" muted playsInline preload="auto" className="scene-media" />
      <div className="scene-copy">
        <h2 data-net-title>{copy.network.title}</h2>
        <div data-meter="orders"><span data-val>0.0M</span><small>{copy.network.meterLabel}</small></div>
        <p data-net-body>{copy.network.body}</p>
      </div>
    </section>
  );
}
```

**Readout component (`FilmHud.tsx`)**
```tsx
"use client";
import { useEffect, useState } from "react";
import { hud } from "@/lib/hud-store";
const names = ["Dispatch", "Detect", "Network", "Optimize", "Deliver"];
export function FilmHud() {
  const [h, setH] = useState(hud.get());
  useEffect(() => hud.sub(setH), []);
  return (
    <>
      <aside className="hud" aria-live="polite">
        <div>0{h.chapter} {names[h.chapter - 1]} · {h.status}</div>
        <div>On-time <b className="metric">{h.onTime}%</b> · km saved <b className="metric">{h.km.toLocaleString()}</b></div>
      </aside>
      <nav className="rail">{names.map((n, i) => (
        <a key={n} href={`#${n.toLowerCase()}`} className={i + 1 === h.chapter ? "on" : ""} aria-label={n} />))}</nav>
    </>
  );
}
```

S4 uses the same hook, plus a horizontal tween on `[data-track]` and `onToggle` per card to `play()` or `pause()` that card's clip. S2 uses the wheel-velocity snippet from earlier.

## 7. Media pipeline

**Step 1: check what you have.**
```bash
for f in raw/*.mp4; do echo "$f $(ffprobe -v error -show_entries format=duration:stream=width,height -of csv=p=0 "$f" | tr '\n' ' ')"; done
```

**Step 2: process.**
```bash
mkdir -p public/media/inspect
# loops
ffmpeg -i raw/dispatch.mp4 -an -c:v libx264 -crf 26 -preset slow -vf scale=1920:-2 -movflags +faststart public/media/dispatch-loop.mp4
for x in a b c; do ffmpeg -i raw/fulfill-1$x.mp4 -an -c:v libx264 -crf 27 -vf scale=1280:-2 -movflags +faststart public/media/fulfill-1$x.mp4; done
# scrubbed: all-intra for instant seeking
ffmpeg -i raw/scale.mp4 -an -c:v libx264 -g 1 -crf 23 -vf scale=1920:-2 -movflags +faststart public/media/scale-scrub.mp4
ffmpeg -i raw/fulfill-2.mp4 -an -c:v libx264 -g 1 -crf 23 -vf scale=1920:-2 -movflags +faststart public/media/fulfill-2-scrub.mp4
# frame sequence
ffmpeg -i raw/inspect.mp4 -vf "fps=24,scale=1600:-1" -c:v libwebp -quality 72 public/media/inspect/%04d.webp
# posters: first frame, plus the final frame of fulfill-2
for f in dispatch scale fulfill-1a fulfill-1b fulfill-1c; do ffmpeg -i raw/$f.mp4 -frames:v 1 -vf scale=1600:-1 public/media/${f/-loop/}-poster.webp; done
ffmpeg -sseof -0.1 -i raw/fulfill-2.mp4 -frames:v 1 -vf scale=1920:-1 public/media/fulfill-2-end.webp
```

After step 2, set `count` in the scenes config to the number of files in `public/media/inspect/`.

**Size budget:**

| Asset | Target size |
|---|---|
| `dispatch-loop` | 4MB or less |
| Each `fulfill-1` card clip | 2MB or less |
| `scale-scrub` | 15MB or less |
| `fulfill-2-scrub` | 15MB or less |
| `inspect` frames | 14MB or less |

## 8. Loading, mobile and accessibility

**Loading:**
- S0 loads immediately.
- Each later section loads when it comes within one viewport of the screen (IntersectionObserver with `rootMargin: "100% 0px"`), which sets `preload="auto"` and starts the frame fetch.
- Posters show until media is ready.

**Mobile (`gsap.matchMedia("(max-width: 768px)")`):**
- Scroll lengths ×0.6.
- `inspect` uses every second frame (96 frames).
- Scrubbed clips use 720p, 9:16 center-crop versions.
- S4 becomes a vertical stack.

**Reduced motion (`prefers-reduced-motion`):**
- No pinning.
- Posters only, no video.
- Meters show their final values.
- Readout panel hidden.

**Accessibility:**
- Videos are `muted playsInline aria-hidden`.
- All copy is real DOM text.
- Rail links are keyboard-reachable.

## 9. File structure

```
config/   copy.ts  scenes.ts
lib/      scroll.ts  hud-store.ts  math.ts  media.ts
hooks/    useScene.ts
components/
  FilmHud.tsx  RouteSpine.tsx  Meter.tsx  SiteFooter.tsx
  sections/ Dispatch.tsx Detect.tsx Drive.tsx Network.tsx Optimize.tsx Deliver.tsx Results.tsx People.tsx
public/media/  (outputs from section 7)
```

## 10. Build priority

| Priority | Work |
|---|---|
| P0 | Media pipeline, `scroll.ts`, `useScene`, readout panel, S0, S1, S3, S5. This is the core experience. |
| P1 | S2 truck drive, S4 horizontal track, S6 results, footer. |
| P2 | Route spine, transitions polish, S7 tilt cards, mobile and reduced-motion variants. |

**QA checklist:**
- Scrubbing is smooth on Chrome and Safari.
- Scrolling backwards reverses everything correctly.
- Readout numbers never jump at chapter boundaries.
- Lighthouse LCP is 2.5s or less using the hero poster.
- No layout shift when pins release.
- Videos fail gracefully to posters.

Send the actual clip file names and durations (the ffprobe output from step 1) if they differ from these names. I'll adjust `scenes.ts` and the beat timings to match.