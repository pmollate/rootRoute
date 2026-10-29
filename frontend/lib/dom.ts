/** Calls `onNear` once, the first time `el` comes within one viewport of the screen. Returns a cancel. */
export function whenNear(el: Element, onNear: () => void): () => void {
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
}

/** After the page's `load` event, background media waits this long so it never competes with the hero. */
const IDLE_DELAY_MS = 1500;

/** Calls `onStart` once: when `el` comes within one viewport, or shortly after the page has loaded, whichever is first. Returns a cancel. */
export function whenNearOrIdle(el: Element, onStart: () => void): () => void {
  let timer = 0;
  let fired = false;
  const afterLoad = () => {
    timer = window.setTimeout(start, IDLE_DELAY_MS);
  };
  const stop = () => {
    stopNear();
    clearTimeout(timer);
    window.removeEventListener('load', afterLoad);
  };
  const start = () => {
    if (fired) return;
    fired = true;
    stop();
    onStart();
  };
  const stopNear = whenNear(el, start);
  if (document.readyState === 'complete') afterLoad();
  else window.addEventListener('load', afterLoad, { once: true });
  return stop;
}

/** Resolves with the decoded image, or rejects if it fails to load. */
export const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((done, fail) => {
    const im = new Image();
    im.onload = () => done(im);
    im.onerror = fail;
    im.src = src;
  });
