'use client';

import { useEffect, useState } from 'react';
import { currentTheme, saveTheme, type Theme } from '@/lib/theme';
import styles from './SiteHeader.module.css';

/** Sun / moon switch in the header. Remembers the choice; until then the page is light. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null); // null until mounted, so SSR and client agree

  // Follows <html data-theme>, so it stays in step with Settings → Appearance.
  useEffect(() => {
    setTheme(currentTheme());
    const watch = new MutationObserver(() => setTheme(currentTheme()));
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => watch.disconnect();
  }, []);

  const toggle = () => {
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
    saveTheme(next);
    setTheme(next);
  };

  const dark = theme === 'dark';
  return (
    <button
      type="button"
      className={styles.theme}
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={dark}
      title={dark ? 'Light mode' : 'Dark mode'}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className={dark ? styles.themeSun : styles.themeMoon}>
        {dark ? (
          <>
            <circle cx="12" cy="12" r="4.2" />
            <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
          </>
        ) : (
          <path d="M20 14.6A8.5 8.5 0 1 1 9.4 4a6.8 6.8 0 0 0 10.6 10.6Z" />
        )}
      </svg>
    </button>
  );
}
