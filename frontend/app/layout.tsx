import type { Metadata, Viewport } from 'next';
import { Inter, Inter_Tight, Michroma } from 'next/font/google';
import { BRAND } from '@/config/copy';
import { sceneWith } from '@/config/scenes';
import { THEME_COLOR, THEME_SCRIPT } from '@/lib/theme';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const interTight = Inter_Tight({ subsets: ['latin'], variable: '--font-inter-tight', display: 'swap' });
/** truck livery; the hero clip has the same face printed in (scripts/process-media.sh). Only used
 * below the fold (S2), so it is not preloaded and never competes with the hero. */
const michroma = Michroma({ subsets: ['latin'], weight: '400', variable: '--font-brand', display: 'swap', preload: false });

/** The first hero slide's poster is the LCP image. */
const HERO_POSTER = sceneWith('dispatch', 'slides').media.slides[0].poster;

export const metadata: Metadata = {
  title: `${BRAND} — every delivery, on the best route`,
  description: `${BRAND} picks the carrier, warehouse and route for every order, then re-plans in milliseconds when anything changes.`,
  icons: { icon: { url: '/brand/favicon.svg', type: 'image/svg+xml' } },
};

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${interTight.variable} ${michroma.variable}`} suppressHydrationWarning>
      <head>
        {/* Apply a saved light/dark choice before first paint (ThemeToggle writes it); otherwise CSS follows the system. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/* fetch the LCP image before JS runs */}
        <link rel="preload" as="image" href={HERO_POSTER} fetchPriority="high" />
      </head>
      <body>{children}</body>
    </html>
  );
}
