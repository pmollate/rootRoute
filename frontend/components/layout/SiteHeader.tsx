import { BrandMark } from '@/components/ui/BrandMark';
import { BRAND, copy } from '@/config/copy';
import { MobileNav } from './MobileNav';
import styles from './SiteHeader.module.css';
import { ThemeToggle } from './ThemeToggle';

export default function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.bar}>
        <MobileNav
          label="Primary"
          brand={<span className={styles.mark}><BrandMark className={styles.glyph} />{BRAND.toUpperCase()}</span>}
          items={copy.nav.map((n) => ({ href: n.href, label: n.label }))}
          footer={<a className={`${styles.link} ${styles.menuCta}`} href={copy.demo.href}>{copy.demo.label}</a>}
        />
        <a className={styles.mark} href="#dispatch" aria-label={`${BRAND} home`}>
          <BrandMark className={styles.glyph} />
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
