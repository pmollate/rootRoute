import { afterEach, describe, expect, it } from 'vitest';
import { THEME_KEY, THEME_SCRIPT } from './theme';

/** Runs the pre-paint script at `path` with `saved` in localStorage; returns the theme it picked. */
function themeAt(path: string, saved: string | null): string | undefined {
  window.history.pushState({}, '', path);
  if (saved) localStorage.setItem(THEME_KEY, saved); else localStorage.removeItem(THEME_KEY);
  delete document.documentElement.dataset.theme;
  new Function(THEME_SCRIPT)();
  return document.documentElement.dataset.theme;
}

describe('pre-paint theme script', () => {
  afterEach(() => { localStorage.clear(); window.history.pushState({}, '', '/'); });

  it('applies a saved dark choice on the site and dashboard; light without one', () => {
    expect(themeAt('/dashboard/intake', 'dark')).toBe('dark');
    expect(themeAt('/', null)).toBe('light');
  });

  it('E19: the client address page is light only, whatever was saved, and the saved choice is kept', () => {
    expect(themeAt('/confirm/' + 'A'.repeat(43), 'dark')).toBe('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(themeAt('/confirmx', 'dark')).toBe('dark'); // only /confirm/ itself
  });
});
