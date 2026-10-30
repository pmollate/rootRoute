'use client';

import { useEffect, useRef, useState } from 'react';
import { SyntheticBadge } from '@/components/dashboard/ui';
import { ConfirmMap } from './ConfirmMap';
import s from './confirm.module.css';
import { LINK_INVALID_TEXT } from './text';

/** CONTRACTS §1 (E19): what `GET /api/confirm/:token` returns for a valid link. Nothing else about the order. */
export interface LinkAddress { line1: string; line2: string | null; city: string; state: string; zip: string }
export interface LinkPin { lat: number; lon: number }
/**
 * CONTRACTS §1.1 (v0.18): the map's reading of the pin (reverse geocode) or of the typed address (forward geocode).
 * `found` false: no point, parts null. `differs`: the typed parts the map reads differently.
 */
export interface MapReading {
  of: 'pin' | 'address'; found: boolean;
  line1: string | null; city: string | null; state: string | null; zip: string | null;
  distanceM: number | null; differs: ('city' | 'state' | 'zip')[];
}
export interface MapCredential { kind: 'sas'; token: string; expiresAt: string }
/** `map` is null when the API could not issue a tile credential: the page is then the address form alone. */
export interface LinkView { address: Partial<LinkAddress>; pin: LinkPin | null; expiresAt: string; synthetic: boolean; map: MapCredential | null }

export { LINK_INVALID_TEXT };

/**
 * Where the map and pin start when the map found no point for the email's address: the middle of the contiguous US.
 * A display default, not data: it is never posted until the client places the pin (REQ-LINK-15).
 */
export const NO_PIN_START: LinkPin = { lat: 39.8283, lon: -98.5795 };

type Fields = { line1: string; line2: string; city: string; state: string; zip: string };
const REQUIRED: (keyof Fields)[] = ['line1', 'city', 'state', 'zip'];
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
const PART: Record<MapReading['differs'][number], string> = { city: 'city', state: 'state', zip: 'ZIP code' };
/** "city", "city and state", "city, state and ZIP code". */
const partsText = (d: MapReading['differs']) => {
  const w = d.map((x) => PART[x]);
  return w.length < 2 ? w.join('') : `${w.slice(0, -1).join(', ')} and ${w.at(-1)}`;
};
const typedText = (a: LinkAddress) => oneLine([a.line1, a.line2, a.city, `${a.state} ${a.zip}`.trim()]);
const until = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/**
 * E19 (SPEC §5.17): the client's one-time address page. Shows the email's address in five fields, a draggable pin and
 * when the link stops working, and nothing else about the order (REQ-LINK-02). Confirm posts through the web proxy (its
 * Origin check, SEC-LINK-07), with a pin only from a working map the client used (REQ-LINK-15); a 409 shows the map's
 * reading of the pin or of the typed address next to what was typed and asks for a second Confirm (REQ-LINK-03, -13,
 * -14); a 503 asks to try again (REQ-LINK-12). All text is React text (SEC-LINK-10). With the emailed code on
 * (REQ-LINK-19), `verifyToken` (held in memory only) goes as the x-link-verify header on the look-up and Confirm, and a
 * 401 verify_required calls `onVerifyRequired` (back to the verify step).
 */
export function ConfirmScreen({ token, view, verifyToken, onVerifyRequired }:
  { token: string; view: LinkView; verifyToken?: string; onVerifyRequired?: () => void }) {
  const postHeaders: Record<string, string> = { 'content-type': 'application/json', ...(verifyToken ? { 'x-link-verify': verifyToken } : {}) };
  const a = view.address;
  const [fields, setFields] = useState<Fields>({ line1: a.line1 ?? '', line2: a.line2 ?? '', city: a.city ?? '', state: a.state ?? '', zip: a.zip ?? '' });
  // The client's pin: the map's start pin, or null until the client places one (the display default is not a pin).
  const [pin, setPin] = useState<LinkPin | null>(view.pin);
  const [phase, setPhase] = useState<Phase>({ kind: 'form', note: null });
  const [busy, setBusy] = useState(false);
  // No credential, or the map refused it: the page is the form alone and sends no pin (REQ-LINK-15). A map counts only
  // once the SDK reports it ready; a later refused tile hides it again.
  const [mapShown, setMapShown] = useState(view.map !== null);
  const [mapReady, setMapReady] = useState(false);
  const pinToSend = mapShown && mapReady ? pin : null;
  // The expiry in the reader's own locale and time zone, which only the browser knows: formatted after hydration, so
  // the server's text (en-US, the server's zone) never has to match the browser's.
  const [expires, setExpires] = useState<string | null>(null);
  useEffect(() => { setExpires(until(view.expiresAt)); }, [view.expiresAt]);

  // REQ-LINK-16: the fields the map filled from the pin, and the look-up's checkId: Confirming them unedited is the
  // client's second Confirm of the map's reading. Editing a field or moving the pin again drops it.
  const [filled, setFilled] = useState<{ checkId: string | null } | null>(null);
  const fieldsNow = useRef(fields);
  fieldsNow.current = fields;
  const lookupSeq = useRef(0);

  /** A reading only counts for the typed address and pin it was read for: changing any field or the pin drops it (and its checkId). */
  const back = () => setPhase((p) => (p.kind === 'check' ? { kind: 'form', note: null } : p));
  const setField = (k: keyof Fields, v: string) => {
    setFields((f) => ({ ...f, [k]: v }));
    setFilled(null);
    back();
  };
  // Line 1, city, state and ZIP must all hold text before Confirm is enabled (line 2 is optional); the API still checks the
  // format (SEC-LINK-10) and the map (REQ-LINK-12).
  const complete = REQUIRED.every((k) => fields[k].trim() !== '');
  const fail = () => { setMapShown(false); setMapReady(false); back(); };
  const move = (p: LinkPin) => { setPin(p); setFilled(null); back(); void readPin(p); };

  /** REQ-LINK-16: the server reads the pin (no map key or geocoding in the browser, SEC-LINK-08); the latest move wins. */
  async function readPin(p: LinkPin) {
    const seq = ++lookupSeq.current;
    const line2 = fieldsNow.current.line2.trim() || null;
    const note = (text: string) => setPhase({ kind: 'form', note: text });
    try {
      const r = await fetch(`/api/confirm/${encodeURIComponent(token)}/lookup`, {
        method: 'POST', headers: postHeaders, cache: 'no-store', body: JSON.stringify({ pin: p, line2 }),
      });
      if (seq !== lookupSeq.current) return;
      if (r.status === 404) { setPhase({ kind: 'invalid' }); return; }
      if (r.status === 401 && onVerifyRequired) { onVerifyRequired(); return; }
      if (r.status === 429) { note('Too many tries from this connection. Please wait a minute and try again.'); return; }
      if (r.status !== 200) return; // the fields stay as typed; Confirm still checks them on the map
      const b = (await r.json()) as { reading: { line1: string | null; city: string | null; state: string | null; zip: string | null; found: boolean }; checkId: string | null };
      if (seq !== lookupSeq.current || !b.reading.found) return;
      const { line1, city, state, zip } = b.reading;
      setFields((f) => ({ ...f, line1: line1 ?? f.line1, city: city ?? f.city, state: state ?? f.state, zip: zip ?? f.zip }));
      setFilled({ checkId: b.checkId });
    } catch {
      // offline: the fields stay as typed
    }
  }

  async function confirm() {
    const address: LinkAddress = { line1: fields.line1.trim(), line2: fields.line2.trim() || null, city: fields.city.trim(),
      state: fields.state.trim().toUpperCase(), zip: fields.zip.trim() };
    const checkId = phase.kind === 'check' ? phase.checkId : filled?.checkId ?? undefined;
    const note = (text: string) => setPhase((p) => (p.kind === 'check' ? { ...p, note: text } : { kind: 'form', note: text }));
    setBusy(true);
    try {
      const r = await fetch(`/api/confirm/${encodeURIComponent(token)}`, {
        method: 'POST', headers: postHeaders, cache: 'no-store',
        body: JSON.stringify({ address, ...(pinToSend ? { pin: pinToSend } : {}), ...(checkId ? { checkId } : {}) }),
      });
      if (r.status === 200) setPhase({ kind: 'done', address });
      else if (r.status === 404) setPhase({ kind: 'invalid' });
      else if (r.status === 401 && onVerifyRequired) onVerifyRequired();
      else if (r.status === 409) {
        const b = (await r.json()) as { reading: MapReading; checkId: string };
        setPhase({ kind: 'check', reading: b.reading, checkId: b.checkId, typed: address, note: null });
      } else if (r.status === 400) note('Please check the address fields: a two-letter US state, a 5-digit ZIP code, and line 1 and city filled in.');
      else if (r.status === 429) note('Too many tries from this connection. Please wait a minute and try again.');
      else if (r.status === 503) note('We could not check your address on the map just now. Please try again in a minute.');
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

  const input = (f: (typeof FIELDS)[number]) => {
    const required = f.key !== 'line2';
    return (
      <label key={f.key} className={s.field}>
        <span>{f.label}{required ? <span className={s.req} data-required aria-hidden="true">*</span> : ' (optional)'}</span>
        <input name={f.key} aria-label={f.label} autoComplete={f.auto} maxLength={f.max} inputMode={f.mode} required={required}
          value={fields[f.key]} onChange={(e) => setField(f.key, e.target.value)} />
      </label>
    );
  };

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

        {/* A refused map is hidden, not unmounted: disposing the SDK's map right after a refused tile throws inside the
            SDK (its attribution timer reads the removed style). It is disposed with the page. */}
        {view.map && (
          <div className={s.mapBlock} hidden={!mapShown}>
            <p className={s.muted}>{view.pin ? 'Drag the pin if your delivery entrance is somewhere else.' : 'Drag the pin to your delivery entrance.'}</p>
            <ConfirmMap pin={view.pin ?? NO_PIN_START} credential={view.map} onMove={move} onFail={fail}
              onReady={() => setMapReady(true)} placed={view.pin !== null} />
            {filled && <p className={s.muted} role="status">Filled in from the map. Check the address above, then Confirm.</p>}
          </div>
        )}

        {phase.kind === 'check' && (
          <div className={s.check}>
            <section aria-label="The address you typed" className={s.box}>
              <h2>You typed</h2>
              <p>{typedText(phase.typed)}</p>
            </section>
            {phase.reading.of === 'address' ? (
              <section aria-label="The map's reading of your address" className={s.box}>
                {phase.reading.found ? (
                  <>
                    <h2>The map reads your address as</h2>
                    <p>{readingText(phase.reading)}</p>
                    {phase.reading.differs.length > 0 && <p className={s.muted}>The map has a different {partsText(phase.reading.differs)}.</p>}
                  </>
                ) : (
                  <>
                    <h2>The map could not find this address</h2>
                    <p className={s.muted}>Please check it. If it is right, confirm again and our order desk will check it.</p>
                  </>
                )}
              </section>
            ) : (
              <section aria-label="The map's reading of your pin" className={s.box}>
                <h2>The map reads your pin as</h2>
                <p>{readingText(phase.reading)}</p>
                {phase.reading.distanceM !== null && <p className={s.muted}>about {phase.reading.distanceM} m from where we placed the pin</p>}
                {phase.reading.differs.length > 0 && (
                  <p className={s.muted}>The map has a different {partsText(phase.reading.differs)} for the address you typed.</p>
                )}
              </section>
            )}
            <p className={s.muted}>{mapShown
              ? 'If both are right, confirm again. If not, fix the fields or move the pin.'
              : 'If your address is right, confirm again. If not, fix the fields.'}</p>
          </div>
        )}

        {phase.note && <p role="alert" className={s.note}>{phase.note}</p>}
        {!complete && <p className={s.muted}>Fill in the fields marked <span className={s.req} aria-hidden="true">*</span> to confirm.</p>}
        <button type="submit" className={s.button} disabled={busy || !complete}>{phase.kind === 'check' ? 'Confirm again' : 'Confirm'}</button>
      </form>
    </main>
  );
}
