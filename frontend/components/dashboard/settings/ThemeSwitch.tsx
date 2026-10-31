'use client';

import { useEffect, useState } from 'react';
import { currentTheme, saveTheme, type Theme } from '@/lib/theme';
import s from './settings.module.css';

const OPTIONS: { theme: Theme; label: string; icon: React.ReactNode }[] = [
  { theme: 'light', label: 'Light', icon: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></> },
  { theme: 'dark', label: 'Dark', icon: <path d="M20 14.6A8.5 8.5 0 1 1 9.4 4a6.8 6.8 0 0 0 10.6 10.6Z" /> },
];

/** Settings → Appearance: Light / Dark as two buttons. Follows <html data-theme>, so it and the header toggle agree. */
export function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme | null>(null); // null until mounted, so SSR and client agree

  useEffect(() => {
    setTheme(currentTheme());
    const watch = new MutationObserver(() => setTheme(currentTheme()));
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => watch.disconnect();
  }, []);

  return (
    <div className={s.segment} role="group" aria-label="Theme">
      {OPTIONS.map((o) => (
        <button key={o.theme} type="button" aria-pressed={theme === o.theme} onClick={() => saveTheme(o.theme)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">{o.icon}</svg>{o.label}
        </button>
      ))}
    </div>
  );
}
