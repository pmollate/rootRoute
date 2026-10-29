/**
 * Media drivers: something a scene can seek to a progress value (0–1).
 * `load` is called shortly after the page loads, or when the scene comes within a viewport, whichever is first.
 */
import type { RefObject } from 'react';
import { drawContain, sizeCanvas } from './canvas';

export type Driver = { seek: (p: number) => void; load?: () => void; kill?: () => void };

/** A useScene `driver` that scrubs the video in `ref`, once it has mounted. */
export const scrubDriver = (ref: RefObject<HTMLVideoElement | null>) => () => (ref.current ? videoScrub(ref.current) : undefined);

/**
 * Scene media downloads one scene at a time, in the order scenes ask (page order), so the next
 * scene down gets the whole connection and is ready first.
 */
let queue: Promise<unknown> = Promise.resolve();
const enqueue = <T>(task: () => Promise<T>) => {
  const run = queue.then(task);
  queue = run.catch(() => undefined);
  return run;
};

/** Whole clips as object URLs, so every seek reads from memory instead of a range request. */
const blobs = new Map<string, Promise<string>>();
const blobUrl = (src: string) => {
  let url = blobs.get(src);
  if (!url) {
    url = enqueue(async () => {
      const r = await fetch(src);
      if (!r.ok) throw new Error(`${r.status} ${src}`);
      return URL.createObjectURL(await r.blob());
    });
    blobs.set(src, url);
  }
  return url;
};

/** The <source> the browser would pick: the first whose media query matches. */
const pickSource = (v: HTMLVideoElement) =>
  [...v.querySelectorAll('source')].find((s) => !s.media || matchMedia(s.media).matches)?.src;

/**
 * Scrub an all-intra <video> by setting currentTime, once the whole clip is in memory (streaming
 * falls back if the download fails); one seek in flight at a time.
 */
export function videoScrub(v: HTMLVideoElement): Driver {
  v.pause();
  let p = 0;
  let raf = 0;
  let started = false;
  let dead = false;
  const tick = () => {
    raf = 0;
    if (!v.duration) return;
    if (v.seeking) {
      raf = requestAnimationFrame(tick);
      return;
    }
    const target = p * v.duration * 0.999;
    if (Math.abs(v.currentTime - target) > 0.01) v.currentTime = target;
  };
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(tick);
  };
  v.addEventListener('loadedmetadata', kick);
  v.addEventListener('seeked', kick);
  return {
    seek: (next) => {
      p = next;
      kick();
    },
    load: () => {
      if (started) return;
      started = true;
      const src = pickSource(v);
      if (!src) return;
      blobUrl(src)
        .then((url) => {
          if (dead) return;
          v.src = url; // overrides the <source> children
          v.load();
        })
        .catch(() => {
          if (dead) return;
          v.preload = 'auto';
          v.load();
        });
    },
    kill: () => {
      dead = true;
      cancelAnimationFrame(raf);
      v.removeEventListener('loadedmetadata', kick);
      v.removeEventListener('seeked', kick);
    },
  };
}

/**
 * Image sequence on a canvas (0001.webp …). Loads the first frame, then the rest (through the scene queue),
 * and holds on the first frame until every frame has arrived, so a slow connection shows a still,
 * never a sequence that jumps between the frames it has so far. `step` 2 = every second frame.
 */
export function frameSeq(c: HTMLCanvasElement, dir: string, count: number, step = 1): Driver {
  const ctx = c.getContext('2d')!;
  const files = Array.from({ length: Math.ceil(count / step) }, (_, i) => `${dir}/${String(i * step + 1).padStart(4, '0')}.webp`);
  const imgs: (HTMLImageElement | undefined)[] = new Array(files.length);
  let p = 0;
  let shown: HTMLImageElement | undefined;
  let started = false;
  let ready = false;
  let dead = false;

  const nearest = (i: number) => {
    for (let d = 0; d < files.length; d++) {
      if (imgs[i - d]) return imgs[i - d];
      if (imgs[i + d]) return imgs[i + d];
    }
  };
  const draw = (force = false) => {
    const img = nearest(ready ? Math.round(p * (files.length - 1)) : 0);
    if (!img || (img === shown && !force)) return;
    ctx.clearRect(0, 0, c.width, c.height);
    drawContain(ctx, img);
    shown = img;
    c.dataset.ready = ''; // lets CSS drop the poster underneath
  };
  const onResize = () => sizeCanvas(c) && draw(true);

  const load = (i: number) =>
    new Promise<void>((done) => {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => {
        if (!dead) {
          imgs[i] = im;
          draw();
        }
        done();
      };
      im.onerror = () => done();
      im.src = files[i];
    });

  sizeCanvas(c);
  window.addEventListener('resize', onResize);
  void load(0);

  return {
    seek: (next) => {
      p = next;
      draw();
    },
    load: () => {
      if (started) return;
      started = true;
      let cursor = 1;
      const worker = async () => {
        while (cursor < files.length && !dead) await load(cursor++);
      };
      void enqueue(() => Promise.all(Array.from({ length: 6 }, worker))).then(() => {
        if (dead) return;
        ready = true;
        draw(true);
      });
    },
    kill: () => {
      dead = true;
      window.removeEventListener('resize', onResize);
    },
  };
}
