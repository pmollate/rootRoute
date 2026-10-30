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
 */
export function ConfirmMap({ pin, credential, onMove, placed = true }: {
  pin: LinkPin; credential: MapCredential; onMove: (pin: LinkPin) => void; placed?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const move = useRef(onMove);
  move.current = onMove;
  const start = useRef(pin); // the map is built once, at the pin the page started with
  const [failed, setFailed] = useState(false);

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
      // A refused credential before the map is ready: say so; the address fields still work. A later tile error is ignored.
      let ready = false;
      m.events.add('error', () => { if (!gone && !ready) setFailed(true); });
      m.events.add('ready', () => {
        ready = true;
        setFailed(false);
        const marker = new atlas.HtmlMarker({ position: at, draggable: true });
        m.markers.add(marker);
        m.events.add('dragend', marker, () => {
          const p = marker.getOptions().position;
          if (p) move.current({ lat: p[1], lon: p[0] });
        });
      });
    }).catch(() => { if (!gone) setFailed(true); });
    return () => { gone = true; map?.dispose(); };
  }, [credential.token, placed]);

  return (
    <div className={s.mapWrap}>
      <div ref={box} className={s.map} role="application" aria-label="Map with your delivery pin" />
      {failed && <p className={s.muted}>The map could not load. You can still confirm the address fields.</p>}
    </div>
  );
}
