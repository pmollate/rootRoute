import type { Metadata } from 'next';
import { IntakeScreen } from '@/components/dashboard/intake/IntakeScreen';

export const metadata: Metadata = { title: 'Order emails' };

export default function Page() {
  return <IntakeScreen />;
}
