/** Route reordering demo (C9c, SPEC §5.19). Python writes `route_demo` (SD-11, synthetic); this only reshapes a row. */

export const DELIVERY_ID = /^D\d{6}$/;

export interface RouteDemoDbRow {
  delivery_id: string; n_stops: number; stops: string; planned_order: string; optimised_order: string;
  planned_km: number; optimised_km: number; actual_km: number | null; overran: boolean; example: string | null;
  synthetic: boolean;
}

export interface RouteDemo {
  synthetic: true; deliveryId: string; nStops: number; stops: [number, number][]; plannedOrder: number[];
  optimisedOrder: number[]; plannedKm: number; optimisedKm: number; actualKm: number | null; overran: boolean;
}

export const shapeRouteDemo = (r: RouteDemoDbRow): RouteDemo => ({
  synthetic: true, deliveryId: r.delivery_id, nStops: r.n_stops, stops: JSON.parse(r.stops),
  plannedOrder: JSON.parse(r.planned_order), optimisedOrder: JSON.parse(r.optimised_order),
  plannedKm: r.planned_km, optimisedKm: r.optimised_km, actualKm: r.actual_km, overran: r.overran,
});
