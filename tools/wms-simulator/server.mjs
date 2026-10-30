// Simulated WMS and carriers for LateLens's order journey (design §9). Local only: listens on 127.0.0.1.
// LateLens POSTs approved orders to /orders; a person moves each one on from the page, which reports the step to
// LateLens's POST /api/orders/:ref/events.
import { timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { localNow, nextStep, receive, stepTs } from './store.mjs';

const PORT = Number(process.env.WMS_SIM_PORT ?? 4100);
const API = process.env.LATELENS_API_URL ?? 'http://localhost:3001';
const DATA = new URL('./data/', import.meta.url);
const FILE = new URL('./orders.json', DATA);
const PAGE = new URL('./index.html', import.meta.url);

for (const key of ['WMS_TOKEN', 'WMS_EVENTS_TOKEN']) {
  if (!process.env[key]) { console.error(`${key} is not set: add it to the root .env (see .env.example)`); process.exit(1); }
}

const load = () => { try { return JSON.parse(readFileSync(FILE, 'utf8')); } catch { return []; } };
const save = (orders) => { mkdirSync(DATA, { recursive: true }); writeFileSync(FILE, JSON.stringify(orders, null, 2)); };
const orders = load();

const bearerOk = (header) => {
  const given = Buffer.from(header?.startsWith('Bearer ') ? header.slice(7) : '');
  const want = Buffer.from(process.env.WMS_TOKEN);
  return given.length === want.length && timingSafeEqual(given, want);
};
const send = (res, status, body) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
const readJson = (req) => new Promise((done) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => { try { done(JSON.parse(raw || '{}')); } catch { done(null); } });
});

/** Reports an order's next step to LateLens; the step is kept only when LateLens accepts it (201, or 200 for a repeat). */
async function advance(order, lateDays) {
  const event = nextStep(order);
  if (!event) return { status: 409, body: { error: 'already delivered' } };
  const ts = stepTs(order, event, lateDays, localNow());
  let res;
  try {
    res = await fetch(`${API}/api/orders/${encodeURIComponent(order.orderRef)}/events`, {
      method: 'POST', signal: AbortSignal.timeout(5000), body: JSON.stringify({ event, ts }),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.WMS_EVENTS_TOKEN}` },
    });
  } catch {
    return { status: 502, body: { error: `LateLens not reachable at ${API}` } };
  }
  const body = await res.json().catch(() => ({}));
  if (res.status === 201 || res.status === 200) {
    order.steps.push({ event, ts });
    save(orders);
  }
  return { status: res.status, body };
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/') {
    return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(readFileSync(PAGE));
  }
  if (req.method === 'POST' && url.pathname === '/orders') {
    if (!bearerOk(req.headers.authorization)) return send(res, 401, { error: 'unauthorized' });
    const r = receive(orders, await readJson(req), localNow());
    if (r.status === 201) save(orders);
    console.log(`order ${r.body.wmsOrderId ?? '(invalid)'} ${r.status}`);
    return send(res, r.status, r.body);
  }
  if (req.method === 'GET' && url.pathname === '/sim/orders') {
    return send(res, 200, { orders: orders.map((o) => ({ ...o, next: nextStep(o) })) });
  }
  const m = /^\/sim\/orders\/([^/]+)\/next$/.exec(url.pathname);
  if (req.method === 'POST' && m) {
    const order = orders.find((o) => o.orderRef === decodeURIComponent(m[1]));
    if (!order) return send(res, 404, { error: 'not found' });
    const body = (await readJson(req)) ?? {};
    const lateDays = Math.max(0, Math.min(30, Number(body.lateDays) || 0));
    const r = await advance(order, lateDays);
    return send(res, r.status, r.body);
  }
  send(res, 404, { error: 'not found' });
}).listen(PORT, '127.0.0.1', () => console.log(`Simulated WMS and carriers on http://localhost:${PORT} (LateLens API ${API})`));
