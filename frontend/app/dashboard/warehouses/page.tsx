import type { Metadata } from 'next';
import { WarehousesScreen } from '@/components/dashboard/warehouses/WarehousesScreen';

export const metadata: Metadata = { title: 'Warehouses' };

export default function Page() {
  return <WarehousesScreen />;
}
