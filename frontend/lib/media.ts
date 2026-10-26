/**
 * Media drivers: something a scene can seek to a progress value (0–1).
 * `load` is called once the scene comes within a viewport of the screen.
 */
import type { RefObject } from 'react';
import { drawContain, sizeCanvas } from './canvas';

export type Driver = { seek: (p: number) => void; load?: () => void; kill?: () => void };

/** A useScene `driver` that scrubs the video in `ref`, once it has mounted. */
export const scrubDriver = (ref: RefObject<HTMLVideoElement | null>) => () => (ref.current ? videoScrub(ref.current) : undefined);

/** Scrub an all-intra <video> by setting currentTime; one seek in flight at a time. */
export function videoScrub(v: HTMLVideoElement): Driver {
  v.pause();
  let p = 0;
  let raf = 0;
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
      if (v.preload === 'auto') return;
      v.preload = 'auto';
      v.load();
    },
    kill: () => {
      cancelAnimationFrame(raf);
      v.removeEventListener('loadedmetadata', kick);
      v.removeEventListener('seeked', kick);
    },
  };
}

/**
 * Image sequence on a canvas (0001.webp …). Loads the first frame, then every 8th, then the rest,
 * and draws the nearest loaded frame until the exact one arrives. `step` 2 = every second frame.
 */
export function frameSeq(c: HTMLCanvasElement, dir: string, count: number, step = 1): Driver {
  const ctx = c.getContext('2d')!;
  const files = Array.from({ length: Math.ceil(count / step) }, (_, i) => `${dir}/${String(i * step + 1).padStart(4, '0')}.webp`);
  const imgs: (HTMLImageElement | undefined)[] = new Array(files.length);
  let p = 0;
  let shown: HTMLImageElement | undefined;
  let started = false;
  let dead = false;

  const nearest = (i: number) => {
    for (let d = 0; d < files.length; d++) {
      if (imgs[i - d]) return imgs[i - d];
      if (imgs[i + d]) return imgs[i + d];
    }
  };
  const draw = (force = false) => {
    const img = nearest(Math.round(p * (files.length - 1)));
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
      const order = [...new Set([...files.keys()].filter((i) => i % 8 === 0).concat([...files.keys()]))];
      let cursor = 0;
      const worker = async () => {
        while (cursor < order.length && !dead) await load(order[cursor++]);
      };
      for (let k = 0; k < 6; k++) void worker();
    },
    kill: () => {
      dead = true;
      window.removeEventListener('resize', onResize);
    },
  };
}
