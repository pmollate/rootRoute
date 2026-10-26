// Builds public/media/globe-dots.json for the hero globe: [lon, lat] pairs on land, spaced ~STEP°
// apart on the sphere. Land outlines come from world-atlas (Natural Earth 110m). Run once:
//   node scripts/globe-dots.mjs
import { writeFileSync } from 'node:fs';

const STEP = 2.2;
const SRC = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json';

const topo = await (await fetch(SRC)).json();
const { scale, translate } = topo.transform;

// delta-decoded, quantised arcs → [lon, lat]
const arcs = topo.arcs.map((arc) => {
  let x = 0, y = 0;
  return arc.map(([dx, dy]) => {
    x += dx;
    y += dy;
    return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
  });
});
const ring = (ids) => ids.flatMap((i) => (i < 0 ? arcs[~i].slice().reverse() : arcs[i]));

const polygons = [];
for (const g of topo.objects.land.geometries) {
  const polys = g.type === 'Polygon' ? [g.arcs] : g.arcs;
  for (const p of polys) polygons.push(p.map(ring));
}

const inRing = (r, x, y) => {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const onLand = (x, y) => polygons.some((p) => inRing(p[0], x, y) && !p.slice(1).some((h) => inRing(h, x, y)));

const dots = [];
for (let lat = -84; lat <= 84; lat += STEP) {
  const n = Math.max(1, Math.round((360 / STEP) * Math.cos((lat * Math.PI) / 180)));
  for (let k = 0; k < n; k++) {
    const lon = -180 + (k + 0.5) * (360 / n);
    if (onLand(lon, lat)) dots.push([+lon.toFixed(1), +lat.toFixed(1)]);
  }
}

writeFileSync(new URL('../public/media/globe-dots.json', import.meta.url), JSON.stringify(dots));
console.log(`${dots.length} land dots`);
