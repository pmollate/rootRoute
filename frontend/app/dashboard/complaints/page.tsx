import type { Metadata } from 'next';
import { ComplaintsScreen } from '@/components/dashboard/complaints/ComplaintsScreen';

export const metadata: Metadata = { title: 'Complaints' };

export default function Page() {
  return <ComplaintsScreen />;
}
