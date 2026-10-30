import type { Metadata } from 'next';
import { ReplayScreen } from '@/components/dashboard/replay/ReplayScreen';

export const metadata: Metadata = { title: 'Labs' };

/** Labs (master navigation): the Replay what-if screen. /dashboard/replay redirects here (next.config.mjs). */
export default function Page() {
  return <ReplayScreen />;
}
