import type { Metadata } from 'next';
import { CarriersScreen } from '@/components/dashboard/carriers/CarriersScreen';

export const metadata: Metadata = { title: 'Carriers' };

export default function Page() {
  return <CarriersScreen />;
}
