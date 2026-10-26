# root-route · frontend

Next.js + GSAP ScrollTrigger landing page that tells one delivery as a scroll film: dispatch → detect → drive → network → optimize, then results and people, and finally deliver, which is also the page footer. Plan: `docs/website-design.md`.

## Run

```bash
npm ci
npm run dev
```

Or from the repo root: `npm run setup && npm run dev` (root scripts forward to this folder).

The processed clips in `public/media` are committed, so the page runs as is. The source clips (`Carrier clips/`, ~60 MB) are gitignored; to re-cut media, get them from the team, drop them in `frontend/Carrier clips/` and run `npm run media` (needs ffmpeg).

## Deploy

This folder is the deployable app. Point the host's project / app root at `frontend/` (Vercel: Root Directory; Azure Static Web Apps: `app_location`), build `npm run build`. `next.config.mjs` sets cache headers for `/media` and `/brand`.

## Clips → sections

| Section | Clip | Output | Playback |
|---|---|---|---|
| S0 Dispatch | `hero-2.mp4`, then `hero.mp4` | `dispatch-intro.mp4`, `dispatch-loop.mp4` | slideshow (`HeroSlides`): each plays once, then the next slides in, forever; dots switch slides; scroll frames it. hero-2 gets a light tint for the copy. "ROOT ROUTE" is printed onto the hero truck's box side during processing |
| S1 Detect | `catching_parcels.mp4` | `inspect/0001–0240.webp` | canvas frame sequence |
| S2 Drive | — | photo truck, wheels turn with scroll | — |
| S3 Network | `aerial rise.mp4` | `scale-scrub.mp4` (+ `-m` 9:16) | all-intra, scrubbed |
| S4 Optimize | `connect` / `Decide` / `Learn` | `fulfill-1a/b/c.mp4` | active card plays; last plays once |
| Deliver / footer (last) | `footer-new.mp4` | `fulfill-2-scrub.mp4` (+ `-m`) | all-intra, scrubbed over the first 78% of its scroll; on the last frame the on-time card swaps for the footer CTA and links |

## Where things live

```
app/            layout (fonts, theme pre-paint, LCP preload, metadata) and the one page
components/
  layout/       page chrome: SiteHeader, ThemeToggle, ChapterRail, RouteSpine, SmoothScroll
  hero/         HeroSlides, HeroGlobe (WebGL, lazy-loaded)
  ui/           small shared pieces: Kicker, Meter, ScrubVideo
  sections/     one file per section; Deliver renders the page footer
config/         scenes.ts (motion, media, media queries) and copy.ts (all text)
hooks/          useScene, useMotion, useNear, useFrameBox, usePrefersReducedMotion, useIsoLayoutEffect
lib/            framework-free utilities: math, format, dom, canvas, media drivers, theme, gsap, scroll, chapter, ph
styles/         theme.css (tokens) → base → components → sections/* → chrome → responsive → motion
scripts/        media pipeline (process-media.sh, cut-truck.py, globe-dots.mjs)
```

- `config/scenes.ts`: scroll length, pin, media, beats and meters for each scene (no copy). `sceneWith(id, kind)` returns a scene with its media typed. Also holds `MOBILE_QUERY`, `REDUCED_MOTION_QUERY`, `MOTION_OK_QUERY`.
- `config/copy.ts`: all text, nav and chapter names. `[bracketed]` figures are placeholders and show with a dotted underline.
- `hooks/useScene.ts`: pins a scene, scrubs its beats, writes `[data-meter]` values, seeks its media, sets the chapter on the rail.
- `hooks/useMotion.ts`: one-off GSAP setup for unpinned sections, skipped under reduced motion.
- `lib/media.ts`: `videoScrub` / `scrubDriver` and `frameSeq` drivers; both start loading one viewport ahead (`lib/dom.ts` `whenNear`).
- `lib/gsap.ts` registers ScrollTrigger once (import `gsap` / `ScrollTrigger` from there); `lib/chapter.ts` holds the chapter shown on the rail.
- Theme: every colour, radius, shadow and stacking level is a token on `:root` in `styles/theme.css`. Base colours are RGB channels (`--bg-rgb`, `--accent-rgb`, …) so translucent variants read `rgb(var(--bg-rgb) / 0.5)`. `lib/theme.ts` holds the light/dark plumbing and `cssToken()` for reading tokens from JS. `app/globals.css` only imports `styles/` in cascade order. The brand name and the demo CTA live in `config/copy.ts` (`BRAND`, `copy.demo`).
- Mobile (≤768px): scroll ×0.6, every second inspect frame, 9:16 scrub clips, S4 stacks vertically.
- `prefers-reduced-motion`: no pins or smooth scroll, posters instead of video, meters at final values.

Truck livery uses Michroma (OFL, `scripts/assets/`): printed into the hero clip by `scripts/process-media.sh` (box-side corners are hard-coded there) and set as text on the S2 truck via `next/font`.
