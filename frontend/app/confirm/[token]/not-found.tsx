import type { Metadata } from 'next';
import { LINK_INVALID_TEXT } from '@/components/confirm/text';
import s from '@/components/confirm/confirm.module.css';

export const metadata: Metadata = { title: 'Link no longer valid', referrer: 'no-referrer', robots: { index: false, follow: false } };

/** REQ-LINK-07: the same page and the same 404 for an unknown, expired, used or revoked link. */
export default function LinkNotFound() {
  return <main className={s.page}><p className={s.message}>{LINK_INVALID_TEXT}</p></main>;
}
