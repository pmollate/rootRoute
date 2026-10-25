# root-route

Next.js + GSAP ScrollTrigger landing page that tells one delivery as a scroll film: dispatch → detect → drive → network → optimize, then results and people, and finally deliver, which is also the page footer. Plan: `website_desginig.md`.

## Run

```bash
npm install
npm run dev
```

The processed clips in `public/media` are committed, so the page runs as is. The source clips (`Carrier clips/`, ~60 MB) are gitignored; to re-cut media, get them from the team, drop them in `Carrier clips/` and run `npm run media` (needs ffmpeg).

## Clips → sections

| Section | Clip | Output | Playback |
|---|---|---|---|
| S0 Dispatch | `hero.mp4` | `dispatch-loop.mp4` | loops; scroll frames it. "ROOT ROUTE" is printed onto the truck's box side during processing |
| S1 Detect | `orbit.mp4` | `inspect/0001–0240.webp` | canvas frame sequence |
| S2 Drive | — | SVG truck, wheels turn with scroll | — |
| S3 Network | `aerial rise.mp4` | `scale-scrub.mp4` (+ `-m` 9:16) | all-intra, scrubbed |
| S4 Optimize | `connect` / `Decide` / `Learn` | `fulfill-1a/b/c.mp4` | active card plays; last plays once |
| Deliver / footer (last) | `footer-new.mp4` | `fulfill-2-scrub.mp4` (+ `-m`) | all-intra, scrubbed over the first 78% of its scroll; on the last frame the on-time card swaps for the footer CTA and links |

## Where things live

- `config/scenes.ts`: scroll length, pin, media, beats and meters for each scene (no copy).
- `config/copy.ts`: all text. `[bracketed]` figures are placeholders and show with a dotted underline.
- `hooks/useScene.ts`: pins a scene, scrubs its beats, writes `[data-meter]` values, seeks its media, feeds the readout.
- `lib/media.ts`: `videoScrub` and `frameSeq` drivers; both start loading one viewport ahead.
- `components/sections/*`: one file per section. `Deliver` renders the page footer.
- Shared UI: `ChapterRail` (+ `RouteSpine`), `SiteHeader`, `Kicker`, `Meter`, `ScrubVideo`, `HeroGlobe`.
- `lib/gsap.ts` registers ScrollTrigger once (import `gsap` / `ScrollTrigger` from there); `lib/chapter.ts` holds the chapter shown on the rail.
- Theme: every colour, radius, shadow and stacking level is a token on `:root` in `app/globals.css`. Base colours are RGB channels (`--bg-rgb`, `--accent-rgb`, …) so translucent variants read `rgb(var(--bg-rgb) / 0.5)`. The brand name and the demo CTA live in `config/copy.ts` (`BRAND`, `copy.demo`).
- Mobile (≤768px): scroll ×0.6, every second inspect frame, 9:16 scrub clips, S4 stacks vertically.
- `prefers-reduced-motion`: no pins or smooth scroll, posters instead of video, meters at final values.

Truck livery uses Michroma (OFL, `scripts/assets/`): printed into the hero clip by `scripts/process-media.sh` (box-side corners are hard-coded there) and set as text on the S2 truck via `next/font`.
