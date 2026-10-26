import type { Metadata } from 'next';
import Image from 'next/image';
import { BRAND } from '@/config/copy';
import styles from './maintenance.module.css';

export const metadata: Metadata = { title: `Under maintenance — ${BRAND}` };

/** Planned-downtime page: headline in a pale disc, unplugged cable looping across it. */
export default function Maintenance() {
  return (
    <main className={styles.page}>
      <div className={styles.disc} aria-hidden="true" />
      <section className={styles.copy}>
        <h1 className={styles.title}>
          This site is <span className={styles.accent}>under maintenance</span>
        </h1>
        <p className={styles.lead}>We’re preparing to serve you better.</p>
      </section>
      {/* white keyed out, so it sits on the disc in both themes */}
      <Image className={styles.plug} src="/media/maintenance.webp" alt="" width={1600} height={302} priority />

    </main>
  );
}
