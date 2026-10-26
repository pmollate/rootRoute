import { BRAND, copy } from '@/config/copy';
import styles from './SiteHeader.module.css';
import { ThemeToggle } from './ThemeToggle';

export default function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.bar}>
        <a className={styles.mark} href="#dispatch" aria-label={`${BRAND} home`}>
          <span className={styles.glyph} aria-hidden="true" />
          {BRAND.toUpperCase()}
        </a>
        <nav className={styles.nav} aria-label="Primary">
          {copy.nav.map((n) => (
            <a key={n.href} className={styles.navLink} href={n.href}>
              {n.label}
            </a>
          ))}
          <ThemeToggle />
          <a className={styles.link} href={copy.demo.href}>
            {copy.demo.label}
          </a>
        </nav>
      </div>
    </header>
  );
}
