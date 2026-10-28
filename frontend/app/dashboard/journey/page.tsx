import type { Metadata } from 'next';
import { JourneyScreen } from '@/components/dashboard/journey/JourneyScreen';

export const metadata: Metadata = { title: 'Order journey' };

/** `/dashboard/journey?ref=email:8` or `?ref=delivery:D000213`; defaults to a real late delivery from the data. */
export default async function Page({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  return <JourneyScreen initialRef={ref ?? 'delivery:D000213'} />;
}
