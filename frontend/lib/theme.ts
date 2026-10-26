/**
 * Light/dark plumbing shared by the pre-paint script (app/layout.tsx) and ThemeToggle.
 * The colours themselves are tokens in styles/theme.css; read them at runtime with cssToken().
 */
export type Theme = 'light' | 'dark';

export const THEME_KEY = 'theme';
export const DARK_QUERY = '(prefers-color-scheme: dark)';
/** browser chrome colour; matches --dark in styles/theme.css */
export const THEME_COLOR = '#121211';

/** Applies a saved choice before first paint; without one, CSS follows the system. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

/** What the page is showing now: a saved choice on <html data-theme>, else the system setting. */
export const currentTheme = (): Theme =>
  (document.documentElement.dataset.theme as Theme | undefined) ?? (window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light');

/** Shows `theme` now and remembers it for the next visit. */
export function saveTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // private mode: the choice just won't survive a reload
  }
}

/** A theme token (e.g. '--accent') as it resolves right now. */
export const cssToken = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
