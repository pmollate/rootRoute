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

/** Resolves with the decoded image, or rejects if it fails to load. */
export const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((done, fail) => {
    const im = new Image();
    im.onload = () => done(im);
    im.onerror = fail;
    im.src = src;
  });
