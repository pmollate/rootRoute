import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ConfirmScreen } from '@/components/confirm/ConfirmScreen';
import { loadLink } from '@/lib/confirm/load';

/**
 * E19 (SPEC §5.17): the client's one-time address page, outside the dashboard (no nav). Open without a session only
 * with CONFIRM_LINK=on (the middleware gates it and sets frame-ancestors 'none' and no-referrer, SEC-LINK-05, -07).
 * Any invalid link gets the one not-found page and status 404 (REQ-LINK-07). Opening never uses up the link (SEC-LINK-06).
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Confirm your delivery address',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};

export default async function ConfirmPage({ params }: { params: Promise<{ token: string }> }) {
  if (process.env.CONFIRM_LINK !== 'on') notFound();
  const { token } = await params;
  const view = await loadLink(token);
  if (!view) notFound();
  return <ConfirmScreen token={token} view={view} />;
}
