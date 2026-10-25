import type { Metadata, Viewport } from 'next';
import { Inter, Inter_Tight, Michroma } from 'next/font/google';
import { BRAND } from '@/config/copy';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const interTight = Inter_Tight({ subsets: ['latin'], variable: '--font-inter-tight', display: 'swap' });
/** truck livery; the hero clip has the same face printed in (scripts/process-media.sh) */
const michroma = Michroma({ subsets: ['latin'], weight: '400', variable: '--font-brand', display: 'swap' });

export const metadata: Metadata = {
  title: `${BRAND} — every delivery, on the best route`,
  description: `${BRAND} picks the carrier, warehouse and route for every order, then re-plans in milliseconds when anything changes.`,
};

const THEME_SCRIPT = `try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export const viewport: Viewport = {
  themeColor: '#121211', // --dark
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${interTight.variable} ${michroma.variable}`} suppressHydrationWarning>
      <head>
        {/* Apply a saved light/dark choice before first paint (ThemeToggle writes it); otherwise CSS follows the system. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/* Hero poster is the LCP image: fetch it before JS runs. */}
        <link rel="preload" as="image" href="/media/dispatch-poster.webp" fetchPriority="high" />
      </head>
      <body>{children}</body>
    </html>
  );
}
