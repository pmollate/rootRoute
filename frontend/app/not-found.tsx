import type { Metadata } from 'next';
import { BRAND, copy } from '@/config/copy';
import LostRoute from '@/components/lost/LostRoute';

export const metadata: Metadata = { title: `Page not found — ${BRAND}` };

export default function NotFound() {
  return <LostRoute {...copy.lost} image="/lost-courier.png" />;
}
