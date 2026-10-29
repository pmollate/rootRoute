import type { Metadata } from 'next';
import ui from '@/components/dashboard/ui.module.css';

export const metadata: Metadata = { title: 'Labs' };

/**
 * Labs (master navigation): where new tools are tried before they join the Dashboard menu. Empty for now.
 * A server page, so it uses the shared styles directly: components/dashboard/ui.tsx is for client screens.
 */
export default function Page() {
  return (
    <>
      <div className={ui.head}><h1 className={ui.title}>Labs</h1></div>
      <section className={ui.card}>
        <h2 className={ui.cardTitle}>Experiments</h2>
        <p className={ui.lede}>New tools are tried here before they join the dashboard. There is nothing to try yet.</p>
      </section>
    </>
  );
}
