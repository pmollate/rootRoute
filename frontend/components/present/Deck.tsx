'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BrandMark } from '@/components/ui/BrandMark';
import { SECTIONS, SLIDES } from './slides';

const N = SLIDES.length;
const clamp = (i: number) => Math.max(0, Math.min(N - 1, i));
/** #3 → index 2; anything else → null */
const fromHash = (hash: string) => {
  const n = Number.parseInt(hash.replace('#', ''), 10);
  return Number.isFinite(n) && n >= 1 && n <= N ? n - 1 : null;
};

/**
 * Pitch deck: one slide on screen, keys / swipe / buttons to move, N for speaker notes, F for full screen.
 * The slide number lives in the URL hash (/present#4), so a reload or a shared link opens the same slide.
 * Printing renders every slide on its own landscape page (the PDF backup).
 */
export function Deck() {
  const [i, setI] = useState(0);
  const [notes, setNotes] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const go = useCallback((k: number) => setI(clamp(k)), []);
  const next = useCallback(() => setI((v) => clamp(v + 1)), []);
  const prev = useCallback(() => setI((v) => clamp(v - 1)), []);

  useEffect(() => {
    const read = () => {
      const k = fromHash(window.location.hash);
      if (k !== null) setI(k);
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  useEffect(() => {
    const want = `#${i + 1}`;
    if (window.location.hash !== want) window.history.replaceState(null, '', want);
  }, [i]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
        case ' ':
          e.preventDefault();
          next();
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
          e.preventDefault();
          prev();
          break;
        case 'Home':
          e.preventDefault();
          go(0);
          break;
        case 'End':
          e.preventDefault();
          go(N - 1);
          break;
        case 'n':
        case 'N':
          setNotes((v) => !v);
          break;
        case 'f':
        case 'F':
          if (document.fullscreenElement) void document.exitFullscreen();
          else void document.documentElement.requestFullscreen?.().catch(() => {});
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, next, prev]);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touch.current;
    touch.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(t.clientY - s.y)) (dx < 0 ? next : prev)();
  };

  const slide = SLIDES[i];

  return (
    <main className="deck" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} aria-roledescription="slide deck">
      <div className="deck-brand" aria-hidden="true">
        <BrandMark className="deck-brand-mark" />
        Root Route
      </div>
      {slide.section && (
        <p className="deck-section" aria-live="polite">
          <span>{slide.section}</span>
          {SECTIONS[slide.section - 1]}
        </p>
      )}

      {SLIDES.map((s, k) => (
        <section
          key={s.id}
          className={`slide slide-${s.id} ${k === i ? 'is-active' : k < i ? 'is-past' : 'is-next'}`}
          aria-roledescription="slide"
          aria-label={`${k + 1} of ${N}: ${s.title}`}
          aria-hidden={k !== i}
          inert={k !== i}
        >
          <div className="slide-inner">{s.body}</div>
          <p className="slide-print-foot">
            Root Route · {k + 1} / {N} · {s.title}
          </p>
        </section>
      ))}

      {notes && (
        <aside className="deck-notes" aria-label="Speaker notes">
          <p className="deck-notes-who">
            {slide.speaker} speaker · {slide.title}
          </p>
          <ul>
            {slide.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </aside>
      )}

      <nav className="deck-bar" aria-label="Slides">
        <button type="button" className="deck-btn" onClick={prev} disabled={i === 0} aria-label="Previous slide">
          ←
        </button>
        <ol className="deck-dots">
          {SLIDES.map((s, k) => (
            <li key={s.id}>
              <button
                type="button"
                className={`deck-dot ${k === i ? 'is-on' : ''}`}
                onClick={() => go(k)}
                aria-label={`Slide ${k + 1}: ${s.title}`}
                aria-current={k === i ? 'step' : undefined}
              />
            </li>
          ))}
        </ol>
        <span className="deck-count" aria-live="polite">
          {i + 1} / {N}
        </span>
        <button type="button" className="deck-btn" onClick={next} disabled={i === N - 1} aria-label="Next slide">
          →
        </button>
        <button
          type="button"
          className={`deck-btn deck-btn-text ${notes ? 'is-on' : ''}`}
          onClick={() => setNotes((v) => !v)}
          aria-pressed={notes}
        >
          Notes
        </button>
      </nav>
      <div className="deck-progress" aria-hidden="true">
        <span style={{ width: `${((i + 1) / N) * 100}%` }} />
      </div>
    </main>
  );
}
