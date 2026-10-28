import type { Metadata } from 'next';
import { ReplayScreen } from '@/components/dashboard/replay/ReplayScreen';

export const metadata: Metadata = { title: 'Replay' };

export default function Page() {
  return <ReplayScreen />;
}
