'use client';

import { useEffect, useState } from 'react';
import { SyntheticBadge } from '@/components/dashboard/ui';
import { ConfirmMap } from './ConfirmMap';
import s from './confirm.module.css';
import { LINK_INVALID_TEXT } from './text';

/** CONTRACTS §1 (E19): what `GET /api/confirm/:token` returns for a valid link. Nothing else about the order. */
export interface LinkAddress { line1: string; line2: string | null; city: string; state: string; zip: string }
export interface LinkPin { lat: number; lon: number }
export interface MapReading { line1: string | null; city: string | null; state: string | null; zip: string | null; distanceM: number }
export interface MapCredential { kind: 'sas'; token: string; expiresAt: string }
/** `map` is null when the API could not issue a tile credential: the page is then the address form alone. */
export interface LinkView { address: Partial<LinkAddress>; pin: LinkPin | null; expiresAt: string; synthetic: boolean; map: MapCredential | null }

export { LINK_INVALID_TEXT };

/**
 * Where the map and pin start when the map found no point for the email's address: the middle of the contiguous US.
 * A display default, not data; the API then always shows the map's reading before it accepts the pin (REQ-LINK-03).
 */
export const NO_PIN_START: LinkPin = { lat: 39.8283, lon: -98.5795 };

type Fields = { line1: string; line2: string; city: string; state: string; zip: string };
const FIELDS: { key: keyof Fields; label: string; auto: string; max: number; mode?: 'numeric' }[] = [
  { key: 'line1', label: 'Address line 1', auto: 'address-line1', max: 100 },
  { key: 'line2', label: 'Address line 2', auto: 'address-line2', max: 100 },
  { key: 'city', label: 'City', auto: 'address-level2', max: 100 },
  { key: 'state', label: 'State', auto: 'address-level1', max: 2 },
  { key: 'zip', label: 'ZIP code', auto: 'postal-code', max: 10, mode: 'numeric' },
];

type Phase =
  | { kind: 'form'; note: string | null }
  | { kind: 'check'; reading: MapReading; checkId: string; typed: LinkAddress; note: string | null }
  | { kind: 'done'; address: LinkAddress }
  | { kind: 'invalid' };

const oneLine = (parts: (string | null | undefined)[]) => parts.filter(Boolean).join(', ');
const readingText = (r: MapReading) => oneLine([r.line1, r.city, [r.state, r.zip].filter(Boolean).join(' ')]) || 'No address found at this point';
const typedText = (a: LinkAddress) => oneLine([a.line1, a.line2, a.city, `${a.state} ${a.zip}`.trim()]);
const until = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/**
 * E19 (SPEC §5.17): the client's one-time address page. Shows the email's address in five fields, a draggable pin and
 * when the link stops working, and nothing else about the order (REQ-LINK-02). Confirm posts through the web proxy (its
 * Origin check, SEC-LINK-07); a 409 shows the map's reading next to the typed address and asks for a second Confirm
 * (REQ-LINK-03). All text is React text (SEC-LINK-10).
 */
export function ConfirmScreen({ token, view }: { token: string; view: LinkView }) {
  const a = view.address;
  const [fields, setFields] = useState<Fields>({ line1: a.line1 ?? '', line2: a.line2 ?? '', city: a.city ?? '', state: a.state ?? '', zip: a.zip ?? '' });
  const [pin, setPin] = useState<LinkPin>(view.pin ?? NO_PIN_START);
  const [phase, setPhase] = useState<Phase>({ kind: 'form', note: null });
  const [busy, setBusy] = useState(false);
  // No credential, or the map refused it: the page is the form alone. The pin stays where it started (REQ-LINK-03 still
  // checks it), but its reading is not shown: the client never saw or placed it.
  const [mapShown, setMapShown] = useState(view.map !== null);
  // The expiry in the reader's own locale and time zone, which only the browser knows: formatted after hydration, so
  // the server's text (en-US, the server's zone) never has to match the browser's.
  const [expires, setExpires] = useState<string | null>(null);
  useEffect(() => { setExpires(until(view.expiresAt)); }, [view.expiresAt]);

  /** A reading only counts for the pin and ZIP it was read for: moving either drops it (and its checkId). */
  const back = () => setPhase((p) => (p.kind === 'check' ? { kind: 'form', note: null } : p));
  const setField = (k: keyof Fields, v: string) => {
    setFields((f) => ({ ...f, [k]: v }));
    if (k === 'zip') back();
  };
  const move = (p: LinkPin) => { setPin(p); back(); };

  async function confirm() {
    const address: LinkAddress = { line1: fields.line1.trim(), line2: fields.line2.trim() || null, city: fields.city.trim(),
      state: fields.state.trim().toUpperCase(), zip: fields.zip.trim() };
    const checkId = phase.kind === 'check' ? phase.checkId : undefined;
    const note = (text: string) => setPhase((p) => (p.kind === 'check' ? { ...p, note: text } : { kind: 'form', note: text }));
    setBusy(true);
    try {
      const r = await fetch(`/api/confirm/${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, cache: 'no-store',
        body: JSON.stringify(checkId ? { address, pin, checkId } : { address, pin }),
      });
      if (r.status === 200) setPhase({ kind: 'done', address });
      else if (r.status === 404) setPhase({ kind: 'invalid' });
      else if (r.status === 409) {
        const b = (await r.json()) as { reading: MapReading; checkId: string };
        setPhase({ kind: 'check', reading: b.reading, checkId: b.checkId, typed: address, note: null });
      } else if (r.status === 400) note('Please check the address fields: a two-letter US state, a 5-digit ZIP code, and line 1 and city filled in.');
      else if (r.status === 429) note('Too many tries from this connection. Please wait a minute and try again.');
      else note('Something went wrong. Please try again.');
    } catch {
      note('Could not reach us. Please check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (phase.kind === 'invalid') return <main className={s.page}><p className={s.message}>{LINK_INVALID_TEXT}</p></main>;
  if (phase.kind === 'done') {
    return (
      <main className={s.page}>
        <p className={s.brand}>Halcyon Logistics</p>
        <p className={s.message}>Thank you. Your delivery address is confirmed.</p>
        <p className={s.box}>{typedText(phase.address)}</p>
        <p className={s.muted}>Our order desk will check it before your order ships. You can close this page.</p>
      </main>
    );
  }

  const input = (f: (typeof FIELDS)[number]) => (
    <label key={f.key} className={s.field}>
      <span>{f.label}{f.key === 'line2' ? ' (optional)' : ''}</span>
      <input name={f.key} aria-label={f.label} autoComplete={f.auto} maxLength={f.max} inputMode={f.mode}
        value={fields[f.key]} onChange={(e) => setField(f.key, e.target.value)} />
    </label>
  );

  return (
    <main className={s.page}>
      <p className={s.brand}>Halcyon Logistics</p>
      <header className={s.head}>
        <h1>Confirm your delivery address</h1>
        {view.synthetic && <SyntheticBadge />}
      </header>
      <p className={s.muted}>{expires ? `This link works until ${expires}.` : 'This link works for a limited time.'}</p>

      <form className={s.form} onSubmit={(e) => { e.preventDefault(); void confirm(); }}>
        {FIELDS.slice(0, 3).map(input)}
        <div className={s.row}>{FIELDS.slice(3).map(input)}</div>

        {mapShown && view.map && (
          <div className={s.mapBlock}>
            <p className={s.muted}>{view.pin ? 'Drag the pin if your delivery entrance is somewhere else.' : 'Drag the pin to your delivery entrance.'}</p>
            <ConfirmMap pin={pin} credential={view.map} onMove={move} onFail={() => setMapShown(false)} placed={view.pin !== null} />
          </div>
        )}

        {phase.kind === 'check' && (
          <div className={s.check}>
            <section aria-label="The address you typed" className={s.box}>
              <h2>You typed</h2>
              <p>{typedText(phase.typed)}</p>
            </section>
            {mapShown ? (
              <>
                <section aria-label="The map's reading of your pin" className={s.box}>
                  <h2>The map reads your pin as</h2>
                  <p>{readingText(phase.reading)}</p>
                  {view.pin && <p className={s.muted}>about {phase.reading.distanceM} m from where we placed the pin</p>}
                </section>
                <p className={s.muted}>If both are right, confirm again. If not, fix the fields or move the pin.</p>
              </>
            ) : (
              <p className={s.muted}>Please check the address above and confirm again.</p>
            )}
          </div>
        )}

        {phase.note && <p role="alert" className={s.note}>{phase.note}</p>}
        <button type="submit" className={s.button} disabled={busy}>{phase.kind === 'check' ? 'Confirm again' : 'Confirm'}</button>
      </form>
    </main>
  );
}
