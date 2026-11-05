'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Status, SyntheticBadge } from '@/components/dashboard/ui';
import { useApi } from '@/hooks/useApi';
import { getJSON } from '@/lib/api';
import s from './replay.module.css';

/** GET /api/labs/route-demo[/:deliveryId] (CONTRACTS §6, SPEC §5.19). Stops and both orders are SD-11, invented. */
interface RouteDemo {
  synthetic: true; deliveryId: string; nStops: number; stops: [number, number][]; plannedOrder: number[];
  optimisedOrder: number[]; plannedKm: number; optimisedKm: number; actualKm: number | null; overran: boolean;
}
interface Examples { synthetic: true; examples: { deliveryId: string; kind: string }[] }

export const DEMO_CAVEAT = "Stop positions are invented (SD-11): the saving shows what reordering does on these points, not on Halcyon's routes. The overrun compares the actual route with the plan, so a shorter plan does not change it.";
const KIND: Record<string, string> = { overrun: 'overran', on_plan: 'within 20%', no_distance: 'no distance' };
const ID = /^D\d{6}$/;
const km = (x: number) => `${x.toFixed(1)} km`;
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;
/** The overrun to 1 dp, or 2 dp when 1 dp would read 20.0% for a route just over the 20% rule. */
const overPct = (x: number) => (x * 100).toFixed(1) === '20.0' ? `${(x * 100).toFixed(2)}%` : pct1(x);

/** The route as an SVG path through the depot (0, 0), scaled into a 0..100 box. */
function pathOf(r: RouteDemo, order: number[], fit: (p: [number, number]) => [number, number]): string {
  const pts: [number, number][] = [[0, 0], ...order.map((i) => r.stops[i]), [0, 0]];
  return pts.map((p, i) => `${i ? 'L' : 'M'}${fit(p).join(' ')}`).join(' ');
}

function Drawing({ r }: { r: RouteDemo }) {
  const span = Math.max(1e-9, ...r.stops.flatMap(([x, y]) => [Math.abs(x), Math.abs(y)]));
  const fit = ([x, y]: [number, number]): [number, number] => [50 + (x / span) * 44, 50 - (y / span) * 44];
  return (
    <svg className={s.rdSvg} viewBox="0 0 100 100" role="img"
      aria-label={`${r.deliveryId}: ${r.nStops} invented stops, planned and reordered routes from the warehouse`}>
      <path d={pathOf(r, r.plannedOrder, fit)} className={s.rdPlanned} />
      <path d={pathOf(r, r.optimisedOrder, fit)} className={s.rdOptimised} />
      {r.stops.map((p, i) => {
        const [cx, cy] = fit(p);
        return <circle key={i} cx={cx} cy={cy} r={1.6} className={s.rdStop}>
          <title>{`Stop ${i + 1}: planned ${r.plannedOrder.indexOf(i) + 1}, reordered ${r.optimisedOrder.indexOf(i) + 1}`}</title>
        </circle>;
      })}
      <rect x={47.5} y={47.5} width={5} height={5} className={s.rdDepot}><title>Fulfilment warehouse</title></rect>
    </svg>
  );
}

export function RouteDemoCard() {
  const ex = useApi<Examples>('/api/labs/route-demo');
  const [typed, setTyped] = useState('');
  /** Every submit or chip click is a new request (n), so the same id fetches again and an invalid submit cancels a pending one. */
  const [req, setReq] = useState<{ id: string | null; n: number }>({ id: null, n: 0 });
  const [state, setState] = useState<{ r?: RouteDemo; error?: 'not_found' | 'failed'; loading: boolean }>({ loading: false });

  useEffect(() => {
    if (!req.id) return;
    let live = true;
    setState({ loading: true });
    getJSON<RouteDemo>(`/api/labs/route-demo/${req.id}`)
      .then((r) => live && setState({ r, loading: false }))
      .catch((e: Error) => live && setState({ error: /not.?found/i.test(e.message) ? 'not_found' : 'failed', loading: false }));
    return () => { live = false; };
  }, [req]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = typed.trim().toUpperCase();
    setReq((q) => ({ id: ID.test(v) ? v : null, n: q.n + 1 }));
    if (!ID.test(v)) setState({ error: 'not_found', loading: false });
  };
  const r = state.r;

  return (
    <section className={s.card} aria-labelledby="rd-head">
      <div className={s.rdHead}>
        <h2 id="rd-head">One route: planned vs reordered</h2>
        <SyntheticBadge />
      </div>
      <form className={s.rdForm} onSubmit={submit}>
        <label>Delivery id <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="D000123" /></label>
        <button type="submit">Show route</button>
      </form>
      {ex.data && (
        <div className={s.rdChips} role="group" aria-label="Example deliveries">
          {ex.data.examples.map((x) => (
            <button key={x.deliveryId} type="button" onClick={() => { setTyped(x.deliveryId); setReq((q) => ({ id: x.deliveryId, n: q.n + 1 })); }}>
              {x.deliveryId} · {KIND[x.kind] ?? x.kind}
            </button>
          ))}
        </div>
      )}
      <Status loading={ex.loading || state.loading} error={ex.error ?? (state.error === 'failed' ? 'failed' : undefined)} skeleton="block" />
      {state.error === 'not_found' && <p className={s.rdNote} role="alert">No delivery with that id.</p>}
      {r && !state.error && (
        <div className={s.rdBody}>
          <Drawing r={r} />
          <div>
            <ul className={s.rdLegend}>
              <li><i className={s.rdKeyPlanned} />Planned order</li>
              <li><i className={s.rdKeyOptimised} />Reordered</li>
            </ul>
            <ul className={s.rdFigs} aria-label="Route figures">
              <li><b>{km(r.plannedKm)}</b><span>planned (real, planned_route_km)</span></li>
              <li><b>{km(r.optimisedKm)}</b><span>reordered ({r.optimisedKm >= r.plannedKm ? 'synthetic, no shorter order found on these points' : `synthetic, ${pct1(1 - r.optimisedKm / r.plannedKm)} shorter than the plan`})</span></li>
              <li><b>{r.actualKm == null ? '—' : km(r.actualKm)}</b>
                <span>{r.actualKm == null ? 'driven: no actual distance recorded'
                  : `driven (real, ${r.overran ? `over plan by ${overPct(r.actualKm / r.plannedKm - 1)}` : 'not more than 20% over the plan'})`}</span></li>
            </ul>
          </div>
        </div>
      )}
      <p className={s.rdNote}>{DEMO_CAVEAT}</p>
    </section>
  );
}
