'use client';

import { useEffect, useRef, useState } from 'react';
import { atlasUrl } from '@/lib/confirm/atlasVersion';
import type { LinkPin, MapCredential } from './ConfirmScreen';
import s from './confirm.module.css';

type Atlas = typeof import('azure-maps-control');
declare global { interface Window { atlas?: Atlas } }

let loading: Promise<Atlas> | null = null;
/**
 * The Azure Maps Web SDK (npm `azure-maps-control`, exact version pinned in package.json), served by this app at
 * /confirm-map/<version>/ and added with one <script> and one <link> on mount: the page loads no third-party script
 * (SEC-LINK-07). Loaded once per page.
 */
function loadAtlas(): Promise<Atlas> {
  if (window.atlas) return Promise.resolve(window.atlas);
  loading ??= new Promise<Atlas>((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = atlasUrl('atlas.min.css');
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = atlasUrl('atlas.min.js');
    js.async = true;
    js.onload = () => (window.atlas ? resolve(window.atlas) : reject(new Error('map SDK missing')));
    js.onerror = () => { loading = null; reject(new Error('map SDK did not load')); };
    document.head.appendChild(js);
  });
  return loading;
}

/**
 * E19 (SPEC §5.17): the draggable pin. Tiles are fetched with the SAS token the API issued for this link, expiring with
 * it (SEC-LINK-08): no Maps key and no NEXT_PUBLIC_ setting reaches the browser. Width 100%, height 280 px (NFR-LINK-01).
 * `pin` is where the pin starts (the display default when `placed` is false). The client drags the pin or taps the map
 * to place it (`onMove`). `onReady` once the map is ready, `onFail` when it cannot load or its tiles are refused: the
 * page sends a pin only from a ready map (REQ-LINK-15).
 */
export function ConfirmMap({ pin, credential, onMove, onFail, onReady, placed = true }: {
  pin: LinkPin; credential: MapCredential; onMove: (pin: LinkPin) => void; onFail: () => void; onReady?: () => void; placed?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const move = useRef(onMove);
  move.current = onMove;
  const fail = useRef(onFail);
  fail.current = onFail;
  const ready = useRef(onReady);
  ready.current = onReady;
  const start = useRef(pin); // the map is built once, at the pin the page started with
  const [failed, setFailed] = useState(false);
  // A map that cannot load is taken away by the page (an empty box helps no one); the address fields still work.
  useEffect(() => { if (failed) fail.current(); }, [failed]);

  useEffect(() => {
    let map: { dispose(): void } | null = null;
    let gone = false;
    loadAtlas().then((atlas) => {
      if (gone || !box.current) return;
      const at: [number, number] = [start.current.lon, start.current.lat];
      const m = new atlas.Map(box.current, {
        center: at, zoom: placed ? 16 : 3, style: 'road', showFeedbackLink: false, language: 'en-US',
        authOptions: { authType: atlas.AuthenticationType.sas, getToken: (resolve) => resolve(credential.token) },
      });
      map = m;
      // A refused credential: before the map is ready, any error; after it, a tile refused with 401 or 403 (the SDK reports
      // the map ready before its tiles load). Other later tile errors (a dropped connection) are ignored.
      let isReady = false;
      m.events.add('error', (e) => {
        const status = (e as { error?: { status?: number } }).error?.status;
        if (!gone && (!isReady || status === 401 || status === 403)) setFailed(true);
      });
      m.events.add('ready', () => {
        isReady = true;
        setFailed(false);
        const marker = new atlas.HtmlMarker({ position: at, draggable: true });
        m.markers.add(marker);
        m.events.add('dragend', marker, () => {
          const p = marker.getOptions().position;
          if (p) move.current({ lat: p[1], lon: p[0] });
        });
        // A tap places the pin too (SPEC §5.17 step 3: the client drags or taps it).
        m.events.add('click', (e) => {
          const p = (e as { position?: [number, number] }).position;
          if (!p) return;
          marker.setOptions({ position: p });
          move.current({ lat: p[1], lon: p[0] });
        });
        if (!gone) ready.current?.();
      });
    }).catch(() => { if (!gone) setFailed(true); });
    return () => { gone = true; map?.dispose(); };
  }, [credential.token, placed]);

  return (
    <div className={s.mapWrap}>
      <div ref={box} className={s.map} role="application" aria-label="Map with your delivery pin" />
    </div>
  );
}
