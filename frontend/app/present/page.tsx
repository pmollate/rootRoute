import type { Metadata } from 'next';
import { Deck } from '@/components/present/Deck';
import '@/styles/present.css';

export const metadata: Metadata = {
  title: 'Root Route — pitch deck',
  description: 'What Halcyon’s own delivery data says makes a delivery late, and what fixes it.',
};

/** The pitch deck. Open without sign-in (lib/auth/open.ts); figures in config/present.ts. */
export default function PresentPage() {
  return <Deck />;
}
