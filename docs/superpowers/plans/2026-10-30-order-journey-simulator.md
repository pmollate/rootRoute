# Order journey simulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New email orders move past "Entered in WMS": LateLens hands the approved order to a separate simulator app
(playing Halcyon's WMS and carriers), and the simulator reports picked → handed over → in transit → delivered back
through an events API, so stages 9–13 of the order journey fill in.

**Architecture:** `send_to_wms` (intake, A) POSTs the order to `WMS_URL` and, on success, records a `wms_entered` event
through the Carriers module's `recordOrderEvent()`, the one writer of the new `order_events` table. The simulator
(`tools/wms-simulator/`, plain Node, no dependencies) stores the orders it receives and, when a person clicks "Next
step", POSTs the event to `POST /api/orders/:ref/events` (Bearer `WMS_EVENTS_TOKEN`). `buildEmailJourney` reads
`order_events` for stages 9–13.

**Tech Stack:** Node 22+, TypeScript (strict, ESM, `.js` import suffixes), Fastify 5, pg, zod 4, Vitest · PostgreSQL 16
· plain Node (`node:http`, `fetch`, `node:test`) for the simulator · Next.js (one text change).

**Read first:** `docs/superpowers/specs/2026-10-30-order-journey-simulator-design.md` (the design, all of it),
`docs/SPEC-order-workflow.md` §4–§7, `backend/api/src/modules/intake/actions.ts`,
`backend/api/src/modules/carriers/journey.ts`.

## Global Constraints

- Timestamps are local strings `YYYY-MM-DD HH:mm`; no time zones anywhere. `order_events.ts` is `timestamp` (no zone)
  and is read back with `to_char(ts, 'YYYY-MM-DD HH24:MI')`.
- Each table has one writer. `order_events` is written only by `recordOrderEvent()` in `modules/carriers/index.ts`.
  Other areas import only `modules/<area>/index.js`.
- The outbound WMS body carries no names, phone numbers, email addresses or street lines (SEC-JRN-01).
- Every `order_events` row is `synthetic = true`; no headline figure reads `order_events` (SPEC §12.1).
- With `WMS_URL` unset, `send_to_wms` behaves exactly as before this plan (status `ENTERED`, audit row, no event).
- Tests name the acceptance criteria they cover (`AC-…`) in the `it(...)` title. Commit messages: `feat(c): …` for
  carriers, `feat(a): …` for intake, `docs: …` for docs; each ends with the `Co-Authored-By` line the session gives.
- Route tests that need Postgres use `describe.skipIf(!hasDb)` and run against `latelens_test`
  (`npm run migrate:test` first). Test files run one at a time (`fileParallelism: false`).
- Run API tests from `backend/api`: `npx vitest run <file>`. Typecheck: `npm --prefix backend/api run lint`.
- Never edit `Halcyon-Hackathon-Dataset/`. Never commit `.env`.
- `docs/SPEC.md`, `docs/CONTRACTS.md` and other files may hold someone else's uncommitted edits. Before each commit,
  run `git diff --stat` on the files you are about to add; if a file has changes that are not yours, stage only your
  hunks (`git add -p <file>`) instead of the whole file.

## File Structure

```
backend/db/migrations/301_order_events.sql          NEW  order_events table (owner C)
backend/api/src/core/bearer.ts                      NEW  Bearer-token check shared by /api/mcp and the events API
backend/api/src/core/config.ts                      MOD  WMS_URL, WMS_TOKEN, WMS_EVENTS_TOKEN
backend/api/src/core/permissions.ts                 MOD  'POST /api/orders/:ref/events': 'public'
backend/api/src/modules/mcp/server.ts               MOD  mcpAuth = bearerAuth (behaviour unchanged)
backend/api/src/modules/carriers/orderEvents.ts     NEW  pure: event order, repeat rules, localNow
backend/api/src/modules/carriers/queries.ts         MOD  orderEventRows, insertOrderEvent, emailExists; emailFacts reads events
backend/api/src/modules/carriers/index.ts           MOD  recordOrderEvent (the one writer)
backend/api/src/modules/carriers/routes.ts          MOD  POST /orders/:ref/events
backend/api/src/modules/carriers/journey.ts         MOD  stages 9–13 from order_events
backend/api/src/modules/intake/wms.ts               NEW  WmsOrder, wmsOrder(), httpWms() (the [WMS_CONTRACT] client)
backend/api/src/modules/intake/actions.ts           MOD  send_to_wms calls the WMS, records wms_entered
backend/api/src/modules/intake/routes.ts            MOD  passes wms + recordOrderEvent to applyAction
backend/api/test/setup.ts                           MOD  WMS_URL='', WMS_EVENTS_TOKEN for tests
backend/api/test/carriers/orderEvents.test.ts       NEW
backend/api/test/routes/order-events.test.ts        NEW  (needs test database)
backend/api/test/intake/wms.test.ts                 NEW
backend/api/test/carriers/journey.test.ts           MOD
frontend/components/dashboard/journey/JourneyScreen.tsx   MOD  the "stages 10 to 13" note
tools/wms-simulator/store.mjs                       NEW  pure: receive order, next step, step timestamp
tools/wms-simulator/server.mjs                      NEW  node:http server, port 4100
tools/wms-simulator/index.html                      NEW  the one page
tools/wms-simulator/store.test.mjs                  NEW  node:test
package.json · .gitignore · .env.example            MOD
docs/SPEC-order-workflow.md · docs/CONTRACTS.md · docs/SPEC.md   MOD (Task 6)
```

---

### Task 1: `order_events` table and the event rules (Carriers)

**Files:**
- Create: `backend/db/migrations/301_order_events.sql`
- Create: `backend/api/src/modules/carriers/orderEvents.ts`
- Modify: `backend/api/src/modules/carriers/queries.ts` (append after `emailFacts`)
- Modify: `backend/api/src/modules/carriers/index.ts`
- Test: `backend/api/test/carriers/orderEvents.test.ts`

**Interfaces:**
- Produces (from `modules/carriers/orderEvents.ts`):
  - `ORDER_EVENTS: readonly ['wms_entered','picked','picked_up','in_transit','out_for_delivery','delivered']`
  - `type OrderEvent = (typeof ORDER_EVENTS)[number]`
  - `FEED_EVENTS: readonly ['picked','picked_up','in_transit','out_for_delivery','delivered']`
  - `interface OrderEventRow { event: OrderEvent; ts: string; detail: Record<string, unknown> }`
  - `interface EventCheck { code: 200 | 201 | 409; error?: string }`
  - `TS: RegExp` (`YYYY-MM-DD HH:mm`), `localNow(d?: Date): string`
  - `checkEvent(existing: OrderEventRow[], event: OrderEvent, ts: string): EventCheck`
- Produces (from `modules/carriers/queries.ts`): `orderEventRows(orderRefs: string[]): Promise<OrderEventRow[]>`,
  `insertOrderEvent(orderRef: string, e: OrderEventRow): Promise<boolean>`, `emailExists(id: number): Promise<boolean>`
- Produces (from `modules/carriers/index.ts`):
  `recordOrderEvent(o: { orderRef: string; event: OrderEvent; ts?: string; detail?: Record<string, unknown> }): Promise<EventCheck & { ts: string }>`
  and re-exports `type OrderEvent`.

- [ ] **Step 1: Write the failing test**

`backend/api/test/carriers/orderEvents.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { checkEvent, localNow, type OrderEventRow } from '../../src/modules/carriers/orderEvents.js';

const row = (event: OrderEventRow['event'], ts: string): OrderEventRow => ({ event, ts, detail: {} });
const ENTERED = [row('wms_entered', '2026-10-30 09:00')];

describe('order event rules (design §6)', () => {
  it('AC-JRN-13: the first event is wms_entered; nothing else comes before it', () => {
    expect(checkEvent([], 'wms_entered', '2026-10-30 09:00')).toEqual({ code: 201 });
    expect(checkEvent([], 'picked', '2026-10-30 09:00')).toEqual({ code: 409, error: 'order is not in the WMS' });
  });

  it('AC-JRN-13: each event needs the one before it', () => {
    expect(checkEvent(ENTERED, 'picked', '2026-10-30 10:00')).toEqual({ code: 201 });
    expect(checkEvent(ENTERED, 'picked_up', '2026-10-30 10:00')).toEqual({ code: 409, error: 'picked_up needs picked first' });
    const upToTransit = [...ENTERED, row('picked', '2026-10-30 10:00'), row('picked_up', '2026-10-30 14:00'),
      row('in_transit', '2026-10-30 18:00')];
    expect(checkEvent(upToTransit, 'delivered', '2026-10-31 12:00'))
      .toEqual({ code: 409, error: 'delivered needs out_for_delivery first' });
    expect(checkEvent(upToTransit, 'out_for_delivery', '2026-10-31 08:00')).toEqual({ code: 201 });
  });

  it('AC-JRN-13: a ts earlier than the previous event is refused; the same ts is allowed', () => {
    expect(checkEvent(ENTERED, 'picked', '2026-10-30 08:59')).toEqual({ code: 409, error: 'ts before wms_entered' });
    expect(checkEvent(ENTERED, 'picked', '2026-10-30 09:00')).toEqual({ code: 201 });
  });

  it('AC-JRN-13: a repeat with the same ts changes nothing (200); with another ts it is refused', () => {
    const picked = [...ENTERED, row('picked', '2026-10-30 10:00')];
    expect(checkEvent(picked, 'picked', '2026-10-30 10:00')).toEqual({ code: 200 });
    expect(checkEvent(picked, 'picked', '2026-10-30 11:00')).toEqual({ code: 409, error: 'already recorded' });
    expect(checkEvent(ENTERED, 'wms_entered', '2026-10-30 09:30')).toEqual({ code: 409, error: 'already recorded' });
  });

  it('localNow gives local YYYY-MM-DD HH:mm', () => {
    expect(localNow(new Date(2026, 9, 30, 7, 5))).toBe('2026-10-30 07:05');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend/api && npx vitest run test/carriers/orderEvents.test.ts`
Expected: FAIL, "Failed to load url ../../src/modules/carriers/orderEvents.js" (module does not exist).

- [ ] **Step 3: Write the migration**

`backend/db/migrations/301_order_events.sql`:

```sql
-- Owner C. Order journey events for new orders (D9; design docs/superpowers/specs/2026-10-30-order-journey-simulator-design.md §7).
-- Writer: modules/carriers recordOrderEvent only. The WMS and carriers are simulated, so every row is synthetic.
CREATE TABLE order_events (
  id serial PRIMARY KEY,
  order_ref text NOT NULL,               -- "email:<id>"
  event text NOT NULL CHECK (event IN ('wms_entered', 'picked', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered')),
  ts timestamp NOT NULL,                 -- local time, no zone ("YYYY-MM-DD HH:mm" in the API)
  detail jsonb NOT NULL DEFAULT '{}',    -- wms_entered: { wmsOrderId }
  synthetic boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_ref, event)
);
```

- [ ] **Step 4: Write the pure rules**

`backend/api/src/modules/carriers/orderEvents.ts`:

```ts
// Order journey events for new orders (D9, design §6): the order and repeat rules of the simulated WMS and carrier feed.
// Pure: queries.ts reads and writes order_events, index.ts joins the two in recordOrderEvent.
export const ORDER_EVENTS = ['wms_entered', 'picked', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered'] as const;
export type OrderEvent = (typeof ORDER_EVENTS)[number];
/** The events the simulator may post. `wms_entered` is written only by send_to_wms. */
export const FEED_EVENTS = ['picked', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered'] as const;

export interface OrderEventRow { event: OrderEvent; ts: string; detail: Record<string, unknown> }
export interface EventCheck { code: 200 | 201 | 409; error?: string }

/** The API's timestamp format: local, no time zone. */
export const TS = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

export function localNow(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Each event needs the one before it and is never earlier than it; a repeat with the same ts changes nothing (a retry),
 * a repeat with another ts is refused. `YYYY-MM-DD HH:mm` strings compare in time order.
 */
export function checkEvent(existing: OrderEventRow[], event: OrderEvent, ts: string): EventCheck {
  const same = existing.find((e) => e.event === event);
  if (same) return same.ts === ts ? { code: 200 } : { code: 409, error: 'already recorded' };
  const i = ORDER_EVENTS.indexOf(event);
  if (i === 0) return { code: 201 };
  if (!existing.some((e) => e.event === 'wms_entered')) return { code: 409, error: 'order is not in the WMS' };
  const prev = existing.find((e) => e.event === ORDER_EVENTS[i - 1]);
  if (!prev) return { code: 409, error: `${event} needs ${ORDER_EVENTS[i - 1]} first` };
  if (ts < prev.ts) return { code: 409, error: `ts before ${prev.event}` };
  return { code: 201 };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend/api && npx vitest run test/carriers/orderEvents.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Add the queries**

In `backend/api/src/modules/carriers/queries.ts`, change the journey import line to:

```ts
import type { CauseFlags, DeliveryFacts, EmailFacts, TrackEvent } from './journey.js';
import type { OrderEventRow } from './orderEvents.js';
```

and append at the end of the file (after `emailFacts`; it uses the `ts` helper defined above it):

```ts
// ---- Order events (design §7): the one table this module writes for new orders ----

export const orderEventRows = (orderRefs: string[]) => query<OrderEventRow>(
  `SELECT event, ${ts('ts')} AS ts, detail FROM order_events WHERE order_ref = ANY($1) ORDER BY ts, id`, [orderRefs]);

/** False when the (order_ref, event) row already exists: two racing requests write one row. */
export async function insertOrderEvent(orderRef: string, e: OrderEventRow): Promise<boolean> {
  const rows = await query<{ id: number }>(
    `INSERT INTO order_events (order_ref, event, ts, detail) VALUES ($1, $2, $3::timestamp, $4)
     ON CONFLICT (order_ref, event) DO NOTHING RETURNING id`, [orderRef, e.event, e.ts, JSON.stringify(e.detail)]);
  return rows.length === 1;
}

export async function emailExists(id: number): Promise<boolean> {
  return (await query('SELECT 1 FROM intake_emails WHERE id = $1', [id])).length === 1;
}
```

- [ ] **Step 7: Add `recordOrderEvent`**

In `backend/api/src/modules/carriers/index.ts`, replace the queries import and append the function:

```ts
import { capacityLimits, insertOrderEvent, insertOverride, laneRows, logRecommendation, orderEventRows, usedToday } from './queries.js';
import { checkEvent, type EventCheck, localNow, type OrderEvent } from './orderEvents.js';

export type { OrderEvent };
```

```ts
/**
 * Design §7: the one writer of order_events, for the events API (the simulated WMS and carriers) and for intake's
 * send_to_wms (`wms_entered`). The order and repeat rules live here, so both callers get them.
 */
export async function recordOrderEvent(o: { orderRef: string; event: OrderEvent; ts?: string; detail?: Record<string, unknown> }):
  Promise<EventCheck & { ts: string }> {
  const ts = o.ts ?? localNow();
  const check = checkEvent(await orderEventRows([o.orderRef]), o.event, ts);
  if (check.code !== 201) return { ...check, ts };
  if (await insertOrderEvent(o.orderRef, { event: o.event, ts, detail: o.detail ?? {} })) return { code: 201, ts };
  // Another request wrote it between the read and the insert: answer as if this one came second.
  return { ...checkEvent(await orderEventRows([o.orderRef]), o.event, ts), ts };
}
```

- [ ] **Step 8: Migrate the databases and typecheck**

Run: `npm run migrate && npm run migrate:test && npm --prefix backend/api run lint`
Expected: the migrate runs report `301_order_events.sql` applied; lint exits 0.

- [ ] **Step 9: Commit**

```bash
git add backend/db/migrations/301_order_events.sql backend/api/src/modules/carriers/orderEvents.ts \
  backend/api/src/modules/carriers/queries.ts backend/api/src/modules/carriers/index.ts \
  backend/api/test/carriers/orderEvents.test.ts
git commit -m "feat(c): order_events table and recordOrderEvent with the event order rules (design §6-7, AC-JRN-13)"
```

---

### Task 2: Events API `POST /api/orders/:ref/events`

**Files:**
- Create: `backend/api/src/core/bearer.ts`
- Modify: `backend/api/src/modules/mcp/server.ts:3,24-30`
- Modify: `backend/api/src/core/config.ts` (Env object, after `MCP_TOKEN`)
- Modify: `backend/api/src/core/permissions.ts` (after `'POST /api/mcp'`)
- Modify: `backend/api/src/modules/carriers/routes.ts`
- Modify: `backend/api/test/setup.ts`
- Modify: `.env.example` (after `MCP_TOKEN=`)
- Test: `backend/api/test/routes/order-events.test.ts`, `backend/api/test/carriers/orderEvents.test.ts` (one more case)

**Interfaces:**
- Consumes: `recordOrderEvent`, `emailExists`, `FEED_EVENTS`, `TS` from Task 1.
- Produces: `bearerAuth(header: string | undefined, token: string | undefined): 200 | 401 | 503` in `core/bearer.ts`;
  `config.WMS_EVENTS_TOKEN`, `config.WMS_URL`, `config.WMS_TOKEN` (all `string | undefined`).

- [ ] **Step 1: Write the failing tests**

Add to `backend/api/test/carriers/orderEvents.test.ts` (new import at the top, new `describe` at the end):

```ts
import { bearerAuth } from '../../src/core/bearer.js';
```

```ts
describe('events API token (design §6)', () => {
  it('AC-SEC-JRN-04: no token configured is 503 (off, never open); a wrong or missing token is 401', () => {
    const token = 'test-wms-events-0123456789';
    expect(bearerAuth(`Bearer ${token}`, undefined)).toBe(503);
    expect(bearerAuth(undefined, token)).toBe(401);
    expect(bearerAuth('Bearer wrong', token)).toBe(401);
    expect(bearerAuth(`Bearer ${token}`, token)).toBe(200);
  });
});
```

`backend/api/test/routes/order-events.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool, query } from '../../src/core/db/pool.js';
import { recordOrderEvent } from '../../src/modules/carriers/index.js';
import { buildApp } from '../../src/server.js';
import { hasDb } from '../db.js';

describe.skipIf(!hasDb)('order events route (needs test database)', () => {
  let app: FastifyInstance;
  let id: number;
  const AUTH = { authorization: 'Bearer test-wms-events-0123456789' };
  const post = (ref: string, payload: object, headers: Record<string, string> = AUTH) =>
    app.inject({ method: 'POST', url: `/api/orders/${ref}/events`, payload, headers });
  const count = async () => (await query<{ n: number }>(
    'SELECT count(*)::int AS n FROM order_events WHERE order_ref = $1', [`email:${id}`]))[0].n;

  beforeAll(async () => {
    app = await buildApp();
    const [row] = await query<{ id: number }>(
      `INSERT INTO intake_emails (source, from_addr, subject, body, received_at, hash, status)
       VALUES ('paste', 'orders@client025.example', '[SYNTHETIC] events test', '[SYNTHETIC] events test',
               '2026-10-30 07:30', $1, 'ENTERED') RETURNING id`, [`order-events-test-${Date.now()}`]);
    id = row.id;
    await query('DELETE FROM order_events WHERE order_ref = $1', [`email:${id}`]);
  });
  afterAll(() => pool.end());

  it('AC-SEC-JRN-04: without the token or with a wrong one, 401 and nothing written', async () => {
    expect((await post(`email:${id}`, { event: 'picked' }, {})).statusCode).toBe(401);
    expect((await post(`email:${id}`, { event: 'picked' }, { authorization: 'Bearer wrong' })).statusCode).toBe(401);
    expect(await count()).toBe(0);
  });

  it('AC-JRN-13: a bad ref or body is 400, an unknown email 404, an order not in the WMS 409', async () => {
    expect((await post('delivery:D000213', { event: 'picked' })).statusCode).toBe(400);
    expect((await post(`email:${id}`, { event: 'wms_entered' })).statusCode).toBe(400);
    expect((await post(`email:${id}`, { event: 'picked', ts: '30/10/2026' })).statusCode).toBe(400);
    expect((await post('email:999999', { event: 'picked' })).statusCode).toBe(404);
    const r = await post(`email:${id}`, { event: 'picked', ts: '2026-10-30 10:00' });
    expect(r.statusCode).toBe(409);
    expect(r.json()).toEqual({ error: 'order is not in the WMS' });
  });

  it('AC-JRN-13: the five steps in order are 201; out of order, early and changed repeats are 409; a same repeat is 200', async () => {
    expect((await recordOrderEvent({ orderRef: `email:${id}`, event: 'wms_entered', ts: '2026-10-30 09:00',
      detail: { wmsOrderId: 'WMS-TEST' } })).code).toBe(201);
    expect((await post(`email:${id}`, { event: 'picked_up', ts: '2026-10-30 10:00' })).json())
      .toEqual({ error: 'picked_up needs picked first' });
    const picked = await post(`email:${id}`, { event: 'picked', ts: '2026-10-30 10:00' });
    expect(picked.statusCode).toBe(201);
    expect(picked.json()).toEqual({ event: 'picked', ts: '2026-10-30 10:00' });
    expect((await post(`email:${id}`, { event: 'picked', ts: '2026-10-30 10:00' })).statusCode).toBe(200);
    expect((await post(`email:${id}`, { event: 'picked', ts: '2026-10-30 11:00' })).statusCode).toBe(409);
    expect((await post(`email:${id}`, { event: 'picked_up', ts: '2026-10-30 09:30' })).json())
      .toEqual({ error: 'ts before picked' });
    for (const [event, ts] of [['picked_up', '2026-10-30 14:00'], ['in_transit', '2026-10-30 18:00'],
      ['out_for_delivery', '2026-10-31 08:00'], ['delivered', '2026-11-02 14:00']]) {
      expect((await post(`email:${id}`, { event, ts })).statusCode, event).toBe(201);
    }
    expect(await count()).toBe(6);
    const rows = await query<{ synthetic: boolean }>('SELECT synthetic FROM order_events WHERE order_ref = $1', [`email:${id}`]);
    expect(rows.every((r) => r.synthetic)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend/api && npx vitest run test/carriers/orderEvents.test.ts test/routes/order-events.test.ts`
Expected: FAIL. `core/bearer.js` does not exist; the route test gets 404 for every POST (route not registered). If
the route test is skipped, Postgres is not running: start it (`docker compose up -d`) and rerun.

- [ ] **Step 3: Move the Bearer check to core**

`backend/api/src/core/bearer.ts`:

```ts
import { timingSafeEqual } from 'node:crypto';

/** `Authorization: Bearer <token>`, compared in constant time. No token configured means the endpoint is off, never open. */
export function bearerAuth(header: string | undefined, token: string | undefined): 200 | 401 | 503 {
  if (!token) return 503;
  const given = Buffer.from(header?.startsWith('Bearer ') ? header.slice(7) : '');
  const want = Buffer.from(token);
  return given.length === want.length && timingSafeEqual(given, want) ? 200 : 401;
}
```

In `backend/api/src/modules/mcp/server.ts`: delete line 3 (`import { timingSafeEqual } from 'node:crypto';`), add
`import { bearerAuth } from '../../core/bearer.js';` with the other imports, and replace the whole `mcpAuth` function
(the doc comment stays) with:

```ts
/** REQ-MCP-02: `Authorization: Bearer <MCP_TOKEN>`. No token configured means the endpoint is off, never open. */
export const mcpAuth = bearerAuth;
```

- [ ] **Step 4: Add the settings**

In `backend/api/src/core/config.ts`, inside `Env`, directly after the `MCP_TOKEN` line:

```ts
  // Order journey simulator (design 2026-10-30): the simulated WMS's address; unset = send_to_wms as before (status only)
  WMS_URL: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),
  // Bearer token LateLens sends to the WMS, and the one the simulator sends to POST /api/orders/:ref/events
  WMS_TOKEN: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(16).optional()),
  WMS_EVENTS_TOKEN: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(16).optional()),
```

In `backend/api/test/setup.ts`, after the `MCP_TOKEN` line:

```ts
process.env.WMS_URL = ''; // send_to_wms as before the simulator, whatever the local .env says; wms.test.ts passes a fake
process.env.WMS_EVENTS_TOKEN = 'test-wms-events-0123456789';
```

In `.env.example`, after `MCP_TOKEN=`:

```
# Order journey simulator (tools/wms-simulator, npm run dev:sim). Empty WMS_URL = send_to_wms only sets the status.
# Tokens: at least 16 characters each, any random string (openssl rand -hex 16); the simulator reads the same .env.
WMS_URL=
WMS_TOKEN=
WMS_EVENTS_TOKEN=
```

In `backend/api/src/core/permissions.ts`, after `'POST /api/mcp': 'public', …`:

```ts
  'POST /api/orders/:ref/events': 'public', // its own Bearer WMS_EVENTS_TOKEN (order journey simulator, design §6)
```

- [ ] **Step 5: Add the route**

In `backend/api/src/modules/carriers/routes.ts`, change the imports:

```ts
import { bearerAuth } from '../../core/bearer.js';
import { config } from '../../core/config.js';
import { carriersApi, recordOrderEvent } from './index.js';
import { FEED_EVENTS, TS } from './orderEvents.js';
import { backtestRows, deliveryFacts, emailExists, emailFacts, insertOverride, laneRows, tracking } from './queries.js';
```

(the existing `import { carriersApi } from './index.js';` and `queries.js` lines are replaced by these). Add after
`OverrideBody`:

```ts
const EventBody = z.object({ event: z.enum(FEED_EVENTS), ts: z.string().regex(TS).optional() });
```

and inside `routes`, after the `/journey/:ref` route:

```ts
  /** Design §6: the simulated WMS and carriers report an order's next step. Its own Bearer token, not a user's. */
  app.post<{ Params: { ref: string } }>('/orders/:ref/events', async (req, reply) => {
    const auth = bearerAuth(req.headers.authorization, config.WMS_EVENTS_TOKEN);
    if (auth !== 200) return reply.code(auth).send({ error: auth === 503 ? 'order events are not set up (WMS_EVENTS_TOKEN)' : 'unauthorized' });
    const m = /^email:(\d+)$/.exec(req.params.ref);
    const body = EventBody.safeParse(req.body);
    if (!m || !body.success) return reply.code(400).send({ error: 'invalid' });
    const emailId = Number(m[1]);
    if (!(await emailExists(emailId))) return reply.code(404).send({ error: 'not found' });
    const r = await recordOrderEvent({ orderRef: `email:${emailId}`, event: body.data.event, ts: body.data.ts });
    req.log.info({ emailId, event: body.data.event, code: r.code }, 'order event');
    return reply.code(r.code).send(r.error ? { error: r.error } : { event: body.data.event, ts: r.ts });
  });
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend/api && npx vitest run test/carriers/orderEvents.test.ts test/routes/order-events.test.ts test/mcp.test.ts test/routes/permissions.test.ts`
Expected: PASS. `permissions.test.ts` passes only because Step 4 added the new route to `PERMISSIONS`.

- [ ] **Step 7: Typecheck and commit**

Run: `npm --prefix backend/api run lint` — expected exit 0.

```bash
git add backend/api/src/core/bearer.ts backend/api/src/modules/mcp/server.ts backend/api/src/core/config.ts \
  backend/api/src/core/permissions.ts backend/api/src/modules/carriers/routes.ts backend/api/test/setup.ts .env.example \
  backend/api/test/carriers/orderEvents.test.ts backend/api/test/routes/order-events.test.ts
git commit -m "feat(c): POST /api/orders/:ref/events for the simulated WMS and carriers (design §6, AC-JRN-13, AC-SEC-JRN-04)"
```

---

### Task 3: `send_to_wms` hands the order to the WMS (Intake)

**Files:**
- Create: `backend/api/src/modules/intake/wms.ts`
- Modify: `backend/api/src/modules/intake/actions.ts` (imports, `ActionOptions`, the `send_to_wms` tail at lines 86–89)
- Modify: `backend/api/src/modules/intake/routes.ts` (imports, the `/intake/:id/action` handler)
- Test: `backend/api/test/intake/wms.test.ts`

**Interfaces:**
- Consumes: `recordOrderEvent` from `modules/carriers/index.js` (Task 1); `config.WMS_URL`, `config.WMS_TOKEN` (Task 2).
- Produces (from `modules/intake/wms.ts`):
  - `interface WmsOrder { orderRef: string; clientId: string | null; warehouseId: string; carrier: string; commitment: string; promiseDate: string; destination: { city: string | null; state: string | null; zip: string | null }; items: { sku: string; qty: number }[] }`
  - `interface Wms { sendOrder(order: WmsOrder): Promise<{ wmsOrderId: string }> }`
  - `wmsOrder(email: EmailRow, x: ExtractionRow): WmsOrder | null`
  - `httpWms(url: string | undefined, token: string | undefined, timeoutMs?: number): Wms | null`
- Produces (from `actions.ts`): `type OrderEventLog`, and `ActionOptions` gains `wms?: Wms | null; orderEvents?: OrderEventLog`.

- [ ] **Step 1: Write the failing test**

`backend/api/test/intake/wms.test.ts`:

```ts
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { AuthUser, CarriersApi, WarehouseApi } from '../../src/core/contracts.js';
import type { LLM } from '../../src/core/llm/types.js';
import type { AddressValidator } from '../../src/core/maps/types.js';
import type { PiiDetector } from '../../src/core/pii/types.js';
import { applyAction, type OrderEventLog } from '../../src/modules/intake/actions.js';
import { processEmail } from '../../src/modules/intake/pipeline.js';
import type { Extraction } from '../../src/modules/intake/schema.js';
import { httpWms, type Wms, type WmsOrder } from '../../src/modules/intake/wms.js';
import { checkPromise } from '../../src/modules/warehouse/domain.js';
import { memoryRepo } from './memoryRepo.js';

// Test values only (as in review.test.ts): a Boston order, nearest warehouse W4, carrier E.
const C025 = { client_id: 'C025', client_name: 'Client 25', sla_penalty_clause: 'N', region: 'Northeast', account_tier: 'Tier 2', account_status: 'active' };
const ORDER: Extraction = { items: [{ sku: 'HX-616', qty: 45 }], requested_commitment: 'next_day', confidence: { items: 0.95, address: 0.9 },
  address: { line1: '12 Main St', line2: null, city: 'Boston', state: 'MA', zip: '02110', raw: null } };
const BODY = '[SYNTHETIC] Please ship 45 x HX-616 to 12 Main St, Boston, MA 02110. Thanks, Pat Lee, 617-555-0100';
const warehouse: WarehouseApi = { checkPromise, nearestWarehouse: async () => 'W4',
  pickWarehouse: async (i) => ({ warehouseId: i.nearestWarehouseId, reason: 'nearest', warnClient: false }) };
const carriers: CarriersApi = { recommendCarrier: async () => ({ carrier: 'E', backup: 'A', reason: 'E: best on this lane', blocked: [], options: [] }) };
const llm: LLM = { name: 'fake', json: async () => structuredClone(ORDER) as never, text: async () => { throw new Error('offline'); } };
const pii: PiiDetector = { name: 'fake-pii', detect: async () => [] };
const maps: AddressValidator = { name: 'fake-map', geocode: async (q) => ({ features: [{ properties: { type: 'Address',
  confidence: 'High', matchCodes: ['Good'], address: { addressLine: q.line1, locality: q.city, postalCode: q.zip,
    adminDistricts: [{ shortName: q.state }] } } }] }) };
const sup: AuthUser = { id: 's1', name: 'Sam Super', roles: ['warehouse_supervisor'], demo: false };

/** An ALL_CLEAR order, approved, with a fake WMS and a fake order event log that record what they got. */
async function approved(wmsAnswer: (o: WmsOrder) => Promise<{ wmsOrderId: string }>,
  eventAnswer: Awaited<ReturnType<OrderEventLog>> = { code: 201 }) {
  const mem = memoryRepo({ 'client025.example': C025 }, []);
  const r = await processEmail({ from: 'orders@client025.example', subject: '[SYNTHETIC] Order', body: BODY, receivedAt: '2026-10-22 07:30' },
    { llm, pii, maps, repo: mem.repo, warehouse, carriers, gmail: null });
  expect(r.decision).toBe('ALL_CLEAR');
  expect(await applyAction(mem.repo, r.id, 'approve', sup)).toEqual({ code: 200, status: 'APPROVED' });
  const sent: WmsOrder[] = [];
  const events: Parameters<OrderEventLog>[0][] = [];
  const wms: Wms = { sendOrder: async (o) => { sent.push(o); return wmsAnswer(o); } };
  const orderEvents: OrderEventLog = async (e) => { events.push(e); return eventAnswer; };
  return { mem, id: r.id, sent, events, wms, orderEvents };
}

describe('send_to_wms with the WMS (design §5)', () => {
  it('AC-JRN-05: the WMS accepts: ENTERED, one wms_entered event with its order number, the number in the audit row', async () => {
    const t = await approved(async () => ({ wmsOrderId: 'WMS-000001' }));
    const r = await applyAction(t.mem.repo, t.id, 'send_to_wms', sup, undefined, { wms: t.wms, orderEvents: t.orderEvents });
    expect(r).toEqual({ code: 200, status: 'ENTERED' });
    expect(t.events).toEqual([{ orderRef: `email:${t.id}`, event: 'wms_entered', detail: { wmsOrderId: 'WMS-000001' } }]);
    expect(t.mem.audit.at(-1)).toMatchObject({ action: 'send_to_wms', user: 's1', payload: { wmsOrderId: 'WMS-000001' } });
    expect(t.sent[0]).toMatchObject({ orderRef: `email:${t.id}`, clientId: 'C025', warehouseId: 'W4', carrier: 'E',
      commitment: 'next_day', destination: { city: 'Boston', state: 'MA', zip: '02110' }, items: [{ sku: 'HX-616', qty: 45 }] });
    expect(t.sent[0].promiseDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // A second click: the order is ENTERED, so it is refused and nothing more is sent or recorded.
    expect(await applyAction(t.mem.repo, t.id, 'send_to_wms', sup, undefined, { wms: t.wms, orderEvents: t.orderEvents }))
      .toMatchObject({ code: 409 });
    expect(t.sent).toHaveLength(1);
    expect(t.events).toHaveLength(1);
  });

  it('AC-JRN-05: the WMS fails or times out: 503, the order stays APPROVED, no event', async () => {
    const t = await approved(async () => { throw new Error('WMS answered 500'); });
    expect(await applyAction(t.mem.repo, t.id, 'send_to_wms', sup, undefined, { wms: t.wms, orderEvents: t.orderEvents }))
      .toEqual({ code: 503, error: 'WMS not reachable' });
    expect((await t.mem.repo.getEmail(t.id))?.status).toBe('APPROVED');
    expect(t.events).toEqual([]);
  });

  it('AC-JRN-05: without a WMS (WMS_URL unset) it behaves as before: ENTERED, no event', async () => {
    const t = await approved(async () => ({ wmsOrderId: 'never' }));
    expect(await applyAction(t.mem.repo, t.id, 'send_to_wms', sup, undefined, { wms: null, orderEvents: t.orderEvents }))
      .toEqual({ code: 200, status: 'ENTERED' });
    expect(t.sent).toEqual([]);
    expect(t.events).toEqual([]);
  });

  it('a retry after a lost response finds wms_entered already recorded and still enters the order', async () => {
    const t = await approved(async () => ({ wmsOrderId: 'WMS-000001' }), { code: 409, error: 'already recorded' });
    expect(await applyAction(t.mem.repo, t.id, 'send_to_wms', sup, undefined, { wms: t.wms, orderEvents: t.orderEvents }))
      .toEqual({ code: 200, status: 'ENTERED' });
  });

  it('AC-SEC-JRN-04: the body sent to the WMS has no names, phone numbers, email addresses or street line', async () => {
    const t = await approved(async () => ({ wmsOrderId: 'WMS-000001' }));
    await applyAction(t.mem.repo, t.id, 'send_to_wms', sup, undefined, { wms: t.wms, orderEvents: t.orderEvents });
    const json = JSON.stringify(t.sent[0]);
    for (const leak of ['Pat Lee', '617-555-0100', '@', '12 Main St']) expect(json).not.toContain(leak);
  });
});

describe('httpWms (design §4)', () => {
  let server: Server | undefined;
  afterEach(() => new Promise<void>((done) => {
    if (!server) return done();
    server.closeAllConnections();
    server.close(() => done());
  }));
  const serve = (handler: Parameters<typeof createServer>[1]) => new Promise<string>((done) => {
    server = createServer(handler).listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${(server!.address() as AddressInfo).port}`));
  });
  const order = { orderRef: 'email:1' } as WmsOrder;

  it('is null when WMS_URL is unset', () => expect(httpWms(undefined, 'x')).toBeNull());

  it('POSTs the order to /orders with the Bearer token and returns the WMS order number', async () => {
    let seen = { url: '', auth: '', body: '' };
    const url = await serve((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        seen = { url: req.url ?? '', auth: req.headers.authorization ?? '', body };
        res.writeHead(201, { 'content-type': 'application/json' }).end(JSON.stringify({ wmsOrderId: 'WMS-000001' }));
      });
    });
    expect(await httpWms(url, 'wms-token-0123456789')!.sendOrder(order)).toEqual({ wmsOrderId: 'WMS-000001' });
    expect(seen).toEqual({ url: '/orders', auth: 'Bearer wms-token-0123456789', body: JSON.stringify(order) });
  });

  it('throws on a non-2xx answer, an answer without wmsOrderId, and a timeout', async () => {
    let answer: (res: import('node:http').ServerResponse) => void = (res) => res.writeHead(500).end();
    const url = await serve((_req, res) => answer(res));
    await expect(httpWms(url, 't')!.sendOrder(order)).rejects.toThrow(/500/);
    answer = (res) => res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
    await expect(httpWms(url, 't')!.sendOrder(order)).rejects.toThrow(/wmsOrderId/);
    answer = (res) => setTimeout(() => res.writeHead(201).end('{"wmsOrderId":"late"}'), 300);
    await expect(httpWms(url, 't', 50)!.sendOrder(order)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend/api && npx vitest run test/intake/wms.test.ts`
Expected: FAIL, "Failed to load url ../../src/modules/intake/wms.js".

- [ ] **Step 3: Write the WMS client**

`backend/api/src/modules/intake/wms.ts`:

```ts
// Design §4 ([WMS_CONTRACT]): the order LateLens hands to Halcyon's WMS. The WMS is simulated (tools/wms-simulator, Q-002).
import type { EmailRow, ExtractionRow } from './repo.js';

export interface WmsOrder {
  orderRef: string;
  clientId: string | null;
  warehouseId: string;
  carrier: string;
  commitment: string;
  promiseDate: string;
  destination: { city: string | null; state: string | null; zip: string | null };
  items: { sku: string; qty: number }[];
}
export interface Wms { sendOrder(order: WmsOrder): Promise<{ wmsOrderId: string }> }

type Checks = { promise?: { promiseDate: string; commitment: string } | null; warehouse?: { warehouseId: string } | null;
  carrier?: { carrier: string } | null };

/**
 * The order from its latest extraction and checks (the carrier after any supervisor change). City, state and ZIP only:
 * no street, names, phone numbers or email addresses (SEC-JRN-01). Null when a check the WMS needs is missing.
 */
export function wmsOrder(email: EmailRow, x: ExtractionRow): WmsOrder | null {
  const c = x.checks as Checks;
  if (!x.extraction || !c.promise || !c.warehouse || !c.carrier) return null;
  const a = x.extraction.address;
  return {
    orderRef: `email:${email.id}`, clientId: email.client_id, warehouseId: c.warehouse.warehouseId, carrier: c.carrier.carrier,
    commitment: c.promise.commitment, promiseDate: c.promise.promiseDate,
    destination: { city: a?.city ?? null, state: a?.state ?? null, zip: a?.zip ?? null },
    items: x.extraction.items.map((i) => ({ sku: i.sku, qty: i.qty })),
  };
}

/** `POST {url}/orders` with a Bearer token. Null when WMS_URL is unset: send_to_wms then only sets the status. */
export function httpWms(url: string | undefined, token: string | undefined, timeoutMs = 5000): Wms | null {
  if (!url) return null;
  return {
    async sendOrder(order) {
      const res = await fetch(new URL('/orders', url), {
        method: 'POST', signal: AbortSignal.timeout(timeoutMs), body: JSON.stringify(order),
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token ?? ''}` },
      });
      if (!res.ok) throw new Error(`WMS answered ${res.status}`);
      const body = (await res.json()) as { wmsOrderId?: unknown };
      if (typeof body.wmsOrderId !== 'string' || !body.wmsOrderId) throw new Error('WMS answered without wmsOrderId');
      return { wmsOrderId: body.wmsOrderId };
    },
  };
}
```

- [ ] **Step 4: Change `send_to_wms`**

In `backend/api/src/modules/intake/actions.ts`:

Add to the imports:

```ts
import { type Wms, wmsOrder } from './wms.js';
```

After the `OverrideLog` type, add:

```ts
/** The Carriers module's `recordOrderEvent` (modules/carriers/index.ts), the one writer of order_events (design §7). */
export type OrderEventLog = (o: { orderRef: string; event: 'wms_entered'; detail: Record<string, unknown> }) =>
  Promise<{ code: number; error?: string }>;
```

Replace the `ActionOptions` doc comment and interface with:

```ts
/**
 * `edited`: the operator's own reply text (send_reply). `reason`: why an order is rejected, or why its carrier changes.
 * `carrier`: the supervisor's carrier for an ALL_CLEAR order (approve only). `overrides`: where that change is logged.
 * `wms`: the WMS send_to_wms hands the order to (null when WMS_URL is unset); `orderEvents`: where `wms_entered` goes.
 */
export interface ActionOptions {
  edited?: string; reason?: string; carrier?: CarrierId; overrides?: OverrideLog; wms?: Wms | null; orderEvents?: OrderEventLog;
}
```

Replace the last four lines of `applyAction` (from `if (x?.decision !== 'ALL_CLEAR') …` to `return { code: 200, status: 'ENTERED' };`) with:

```ts
  if (x?.decision !== 'ALL_CLEAR') return { code: 409, error: 'only ALL_CLEAR orders go to the WMS' };
  // Design §5: the order counts as entered only once the WMS has accepted it; without WMS_URL, as before (status only).
  let payload: object = who;
  if (opts.wms) {
    const order = wmsOrder(email, x);
    if (!order) return { code: 409, error: 'the order has no promise, warehouse or carrier to send' };
    if (!opts.orderEvents) return { code: 503, error: 'the order event log is not available' };
    let wmsOrderId: string;
    try {
      ({ wmsOrderId } = await opts.wms.sendOrder(order));
    } catch {
      return { code: 503, error: 'WMS not reachable' };
    }
    const r = await opts.orderEvents({ orderRef: order.orderRef, event: 'wms_entered', detail: { wmsOrderId } });
    // A retry after a lost response finds wms_entered already there: the WMS has the order, so it is entered.
    if (r.code !== 201 && r.code !== 200 && r.error !== 'already recorded') {
      return { code: 503, error: `the WMS entry was not recorded: ${r.error ?? r.code}` };
    }
    payload = { ...who, wmsOrderId };
  }
  await repo.setStatus(id, 'ENTERED');
  await repo.logApproval(id, 'send_to_wms', user, payload);
  return { code: 200, status: 'ENTERED' };
```

- [ ] **Step 5: Wire the route**

In `backend/api/src/modules/intake/routes.ts`, change the carriers import and add the wms import:

```ts
import { logOverride, recordOrderEvent } from '../carriers/index.js';
import { httpWms } from './wms.js';
```

Inside `const routes: FastifyPluginAsync = async (app) => {`, as its first line:

```ts
  const wms = httpWms(config.WMS_URL, config.WMS_TOKEN); // null without WMS_URL (design §5)
```

In the `/intake/:id/action` handler, replace the options object passed to `applyAction` with:

```ts
      { edited: body.data.reply, reason: body.data.reason, carrier: body.data.carrier, overrides: logOverride,
        wms, orderEvents: recordOrderEvent });
```

and add `error: result.error ?? null` to the `req.log.info` fields so a refused WMS handoff is visible in the logs:

```ts
    req.log.info({ emailId: Number(req.params.id), action: body.data.action, carrier: body.data.carrier ?? null, code: result.code,
      error: result.error ?? null }, 'intake action');
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend/api && npx vitest run test/intake/wms.test.ts test/intake/review.test.ts test/routes/intake.test.ts test/routes/review.test.ts`
Expected: PASS. `routes/intake.test.ts` still gets `{ status: 'ENTERED' }` because `test/setup.ts` sets `WMS_URL=''`.

- [ ] **Step 7: Typecheck and commit**

Run: `npm --prefix backend/api run lint` — expected exit 0.

```bash
git add backend/api/src/modules/intake/wms.ts backend/api/src/modules/intake/actions.ts \
  backend/api/src/modules/intake/routes.ts backend/api/test/intake/wms.test.ts
git commit -m "feat(a): send_to_wms hands the order to the WMS and records wms_entered ([WMS_CONTRACT], AC-JRN-05, AC-SEC-JRN-04)"
```

---

### Task 4: Journey stages 9–13 from `order_events`

**Files:**
- Modify: `backend/api/src/modules/carriers/journey.ts` (imports, `EmailFacts`, `buildEmailJourney`)
- Modify: `backend/api/src/modules/carriers/queries.ts` (`emailFacts`)
- Modify: `frontend/components/dashboard/journey/JourneyScreen.tsx:32`
- Test: `backend/api/test/carriers/journey.test.ts`

**Interfaces:**
- Consumes: `OrderEventRow`, `OrderEvent`, `localNow` (Task 1), `orderEventRows` (Task 1).
- Produces: `EmailFacts.events: OrderEventRow[]`; `buildEmailJourney(e: EmailFacts, now?: string): Journey`.

- [ ] **Step 1: Write the failing tests**

In `backend/api/test/carriers/journey.test.ts`, add `events: [],` to the `EMAIL` constant, after `overrides: [],`:

```ts
  approvals: [], outbound: [], overrides: [], events: [],
```

and add inside `describe('new order journey', …)`:

```ts
  const ENTERED_EMAIL: EmailFacts = { ...EMAIL, status: 'ENTERED',
    approvals: [{ action: 'approve', actor: 'sup', at: '2026-10-28 07:50', reason: null },
      { action: 'send_to_wms', actor: 'sup', at: '2026-10-28 07:55', reason: null }],
    events: [{ event: 'wms_entered', ts: '2026-10-28 07:55', detail: { wmsOrderId: 'WMS-000008' } }] };
  const ev = (event: EmailFacts['events'][number]['event'], ts: string) => ({ event, ts, detail: {} });

  it('AC-JRN-14: entered in the simulated WMS: stage 9 synthetic with the WMS number, picking is current', () => {
    const j = buildEmailJourney(ENTERED_EMAIL, '2026-10-28 08:00');
    expect(byKey(j, 'wms')).toMatchObject({ status: 'done', at: '2026-10-28 07:55', source: 'synthetic' });
    expect(byKey(j, 'wms').detail).toMatch(/WMS-000008/);
    expect(byKey(j, 'picked').status).toBe('current');
    expect(['handed', 'transit', 'delivered'].map((k) => byKey(j, k).status)).toEqual(['not_reached', 'not_reached', 'not_reached']);
  });

  it('AC-JRN-14: events up to in_transit: stages 9-12 done and synthetic, delivery current', () => {
    const j = buildEmailJourney({ ...ENTERED_EMAIL, events: [...ENTERED_EMAIL.events, ev('picked', '2026-10-28 09:00'),
      ev('picked_up', '2026-10-28 14:00'), ev('in_transit', '2026-10-28 18:00')] }, '2026-10-28 19:00');
    expect(j.stages.slice(8, 12).map((s) => [s.status, s.source])).toEqual([['done', 'synthetic'], ['done', 'synthetic'],
      ['done', 'synthetic'], ['done', 'synthetic']]);
    expect(byKey(j, 'handed').actor).toMatch(/Carrier A/);
    expect(byKey(j, 'transit').at).toBe('2026-10-28 18:00');
    expect(byKey(j, 'delivered').status).toBe('current');
  });

  it('AC-JRN-14: delivered two days after the promise date fails stage 13 with "2 days late"; on time is done', () => {
    const all = [...ENTERED_EMAIL.events, ev('picked', '2026-10-28 09:00'), ev('picked_up', '2026-10-28 14:00'),
      ev('in_transit', '2026-10-28 18:00'), ev('out_for_delivery', '2026-10-29 08:00')];
    const late = buildEmailJourney({ ...ENTERED_EMAIL, events: [...all, ev('delivered', '2026-10-31 14:00')] }, '2026-11-01 09:00');
    expect(byKey(late, 'delivered')).toMatchObject({ status: 'failed', at: '2026-10-31 14:00', source: 'synthetic' });
    expect(byKey(late, 'delivered').detail).toMatch(/2 days late/);
    expect(late.summary.outcome).toBe('2 days late');
    const onTime = buildEmailJourney({ ...ENTERED_EMAIL, events: [...all, ev('delivered', '2026-10-29 12:00')] }, '2026-10-29 13:00');
    expect(byKey(onTime, 'delivered').status).toBe('done');
    expect(onTime.summary.outcome).toBe('delivered');
    expect(byKey(onTime, 'notice').status).toBe('not_reached');
  });

  it('AC-JRN-14: not delivered by the end of the promise date is at risk', () => {
    const j = buildEmailJourney({ ...ENTERED_EMAIL, events: [...ENTERED_EMAIL.events, ev('picked', '2026-10-28 09:00')] },
      '2026-10-30 08:00');
    expect(byKey(j, 'delivered').status).toBe('at_risk');
    expect(byKey(j, 'handed').status).toBe('current');
    expect(buildEmailJourney(ENTERED_EMAIL, '2026-10-29 23:59').stages.find((s) => s.key === 'delivered')!.status)
      .toBe('not_reached');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend/api && npx vitest run test/carriers/journey.test.ts`
Expected: FAIL. The typecheck in Vitest passes (esbuild strips types), but the four new tests fail: `picked` is
`not_reached`, not `current`, and stage 9's detail says `WMS-8`.

- [ ] **Step 3: Build stages 9–13 from the events**

In `backend/api/src/modules/carriers/journey.ts`:

Add to the imports:

```ts
import { localNow, type OrderEvent, type OrderEventRow } from './orderEvents.js';
```

Change the section comment above `EmailFacts` to:

```ts
// ---- New orders (intake tables; stages 9-13 from order_events, written by the simulated WMS and carriers) ----
```

Add to `EmailFacts`, after `overrides`:

```ts
  events: OrderEventRow[];
```

Add before `export function buildEmailJourney`:

```ts
const DAY_MS = 86_400_000;
/** Whole days from one YYYY-MM-DD to another (positive when `to` is later). */
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
```

Change the signature and the first lines of `buildEmailJourney`:

```ts
export function buildEmailJourney(e: EmailFacts, now = localNow()): Journey {
  const did = (action: string) => e.approvals.find((a) => a.action === action);
```

and after `const rounds = …;` add:

```ts
  const ev = (name: OrderEvent) => e.events.find((x) => x.event === name);
  const entered = ev('wms_entered');
  const carrierName = c?.carrier ? `Carrier ${c.carrier.carrier}` : 'Carrier';
  const promised = c?.promise?.promiseDate ?? null;
  const sim = (x: OrderEventRow | undefined, actor: string, detail: string): Part | null =>
    x ? { status: 'done', at: x.ts, actor, source: 'synthetic', detail } : null;
  const delivered = ev('delivered');
  const late = delivered && promised ? daysBetween(promised, delivered.ts.slice(0, 10)) : 0;
  const deliveredPart = (): Part => {
    if (delivered) {
      return late > 0
        ? { status: 'failed', at: delivered.ts, actor: carrierName, source: 'synthetic', detail: `Delivered ${days(late)} late (promised ${promised}).` }
        : { status: 'done', at: delivered.ts, actor: carrierName, source: 'synthetic',
          detail: promised ? `Delivered on time (promised ${promised}).` : 'Delivered.' };
    }
    // REQ-JRN-06: no delivery by the end of the promise date.
    if (entered && promised && now.slice(0, 10) > promised) {
      return { status: 'at_risk', at: null, actor: carrierName, source: 'synthetic', detail: `Not delivered by the end of ${promised}.` };
    }
    return notReached('Carrier');
  };
  const out = ev('out_for_delivery');
  const transit = ev('in_transit');
```

In the `parts` object, replace the `wms:` entry with:

```ts
    wms: reject ? notReached()
      : entered ? { status: 'done', at: entered.ts, actor: wms?.actor ?? 'Operator', source: 'synthetic',
        detail: `Entered in the simulated WMS as ${String(entered.detail.wmsOrderId ?? `WMS-${e.id}`)}.` }
        : wms ? { status: 'done', at: wms.at, actor: wms.actor, source: 'synthetic', detail: `Entered in the simulated WMS as WMS-${e.id}.` }
          : approve && clear ? { status: 'current', at: null, actor: 'Operator', source: 'real', detail: 'Approved, not entered yet.' } : notReached(),
```

and replace the line `picked: notReached('Warehouse'), handed: …, delivered: notReached('Carrier'), notice: notReached(),` with:

```ts
    picked: sim(ev('picked'), 'Warehouse (simulated)', 'Picked in the simulated WMS.') ?? notReached('Warehouse'),
    handed: sim(ev('picked_up'), `${carrierName} (simulated)`, `Collected by ${carrierName}.`) ?? notReached('Carrier'),
    transit: sim(out ?? transit, `${carrierName} (simulated)`,
      out ? `Out for delivery${transit ? ` (in transit since ${transit.ts})` : ''}.` : 'In transit.') ?? notReached('Carrier'),
    delivered: deliveredPart(),
    notice: notReached(),
  };
  // Once the WMS has the order, the first step it has not reported yet is the one in progress.
  if (entered) {
    const next = (['picked', 'handed', 'transit', 'delivered'] as const).find((k) => parts[k].status === 'not_reached');
    if (next) parts[next] = { ...parts[next], status: 'current', source: 'synthetic', detail: 'Waiting for the simulated warehouse or carrier.' };
  }
```

(the `};` that closed `parts` moves up into this block, as shown: `notice: notReached(),` then `};`). Finally, in the
returned `summary`, replace the `outcome` expression with:

```ts
      outcome: reject ? 'Rejected' : delivered ? (late > 0 ? `${days(late)} late` : 'delivered') : e.status.replace('_', ' ').toLowerCase() },
```

- [ ] **Step 4: Read the events in `emailFacts`**

In `backend/api/src/modules/carriers/queries.ts`, in `emailFacts`, after the `overrides` query add:

```ts
  const events = await orderEventRows(refs);
```

and in its returned object change `decision: x?.decision ?? null, checks: x?.checks ?? null, approvals, outbound, overrides,` to:

```ts
    decision: x?.decision ?? null, checks: x?.checks ?? null, approvals, outbound, overrides, events,
```

(`orderEventRows` is defined lower in the same file as a `const`; it is only called at request time, so the order of
definitions does not matter.)

- [ ] **Step 5: Update the page note**

In `frontend/components/dashboard/journey/JourneyScreen.tsx`, replace line 32:

```ts
const FUTURE = 'Stages 9 to 13 come from the simulated WMS and carriers: synthetic data.';
```

and update its doc comment on line 31 to `/** Shown for an order's warehouse and carrier stages (REQ-JRN-08). */`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend/api && npx vitest run test/carriers/journey.test.ts test/routes/journey.test.ts`
Expected: PASS (all existing journey tests plus the four new ones).

Run: `npm --prefix frontend test -- JourneyScreen` — expected PASS (no test asserts the old note).

- [ ] **Step 7: Typecheck and commit**

Run: `npm run typecheck` — expected exit 0.

```bash
git add backend/api/src/modules/carriers/journey.ts backend/api/src/modules/carriers/queries.ts \
  backend/api/test/carriers/journey.test.ts frontend/components/dashboard/journey/JourneyScreen.tsx
git commit -m "feat(c): order journey stages 9-13 from the simulated WMS and carrier events (REQ-JRN-06, -08, AC-JRN-14)"
```

---

### Task 5: The simulator app (`tools/wms-simulator/`)

**Files:**
- Create: `tools/wms-simulator/store.mjs`, `tools/wms-simulator/server.mjs`, `tools/wms-simulator/index.html`
- Test: `tools/wms-simulator/store.test.mjs`
- Modify: `package.json` (scripts), `.gitignore`

**Interfaces:**
- Consumes: `POST /api/orders/:ref/events` (Task 2) and the `WmsOrder` body that `httpWms` sends (Task 3).
- Produces: `POST /orders` (Bearer `WMS_TOKEN`) → `201 | 200 { wmsOrderId }`; the page at `http://localhost:4100/`.

- [ ] **Step 1: Write the failing test**

`tools/wms-simulator/store.test.mjs`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDays, nextStep, receive, stepTs, wmsOrderId } from './store.mjs';

const ORDER = { orderRef: 'email:42', clientId: 'C025', warehouseId: 'W4', carrier: 'E', commitment: 'next_day',
  promiseDate: '2026-10-31', destination: { city: 'Boston', state: 'MA', zip: '02110' }, items: [{ sku: 'HX-616', qty: 45 }] };

test('the WMS order number is WMS- and the email id in six digits', () => {
  assert.equal(wmsOrderId('email:42'), 'WMS-000042');
  assert.equal(wmsOrderId('order:42'), null);
});

test('a new order is 201, the same orderRef again 200 with the same number, a bad body 400', () => {
  const orders = [];
  assert.deepEqual(receive(orders, ORDER, '2026-10-30 09:00'), { status: 201, body: { wmsOrderId: 'WMS-000042' } });
  assert.deepEqual(receive(orders, ORDER, '2026-10-30 09:05'), { status: 200, body: { wmsOrderId: 'WMS-000042' } });
  assert.equal(orders.length, 1);
  assert.deepEqual(orders[0].steps, []);
  assert.equal(receive(orders, { ...ORDER, items: [] }, '2026-10-30 09:00').status, 400);
  assert.equal(receive(orders, { orderRef: 'email:7' }, '2026-10-30 09:00').status, 400);
});

test('steps go picked, picked_up, in_transit, out_for_delivery, delivered, then none', () => {
  const o = { ...ORDER, steps: [] };
  for (const step of ['picked', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered']) {
    assert.equal(nextStep(o), step);
    o.steps.push({ event: step, ts: '2026-10-30 10:00' });
  }
  assert.equal(nextStep(o), null);
});

test('a step is stamped now, never before the last step; a late delivery lands N days after the promise date', () => {
  const o = { ...ORDER, steps: [{ event: 'picked', ts: '2026-10-30 12:00' }] };
  assert.equal(stepTs(o, 'picked_up', 0, '2026-10-30 13:00'), '2026-10-30 13:00');
  assert.equal(stepTs(o, 'picked_up', 0, '2026-10-30 11:00'), '2026-10-30 12:00');
  assert.equal(stepTs(o, 'delivered', 2, '2026-10-30 13:00'), '2026-11-02 14:00');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tools/wms-simulator/`
Expected: FAIL, "Cannot find module … store.mjs".

- [ ] **Step 3: Write the store**

`tools/wms-simulator/store.mjs`:

```js
// Simulated Halcyon WMS and carriers (design docs/superpowers/specs/2026-10-30-order-journey-simulator-design.md §9).
// Pure: the orders it holds, the next step of each, and the timestamp a step is reported with. Synthetic data only.
export const STEPS = ['picked', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered'];
const TS = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

export function wmsOrderId(orderRef) {
  const id = /^email:(\d+)$/.exec(orderRef ?? '')?.[1];
  return id ? `WMS-${id.padStart(6, '0')}` : null;
}

export function localNow(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const valid = (o) => o && wmsOrderId(o.orderRef) && typeof o.warehouseId === 'string' && typeof o.carrier === 'string'
  && /^\d{4}-\d{2}-\d{2}$/.test(o.promiseDate ?? '') && Array.isArray(o.items) && o.items.length > 0;

/** Design §4: a new order is 201; the same orderRef again is 200 with the same number (LateLens may retry). */
export function receive(orders, order, now) {
  if (!valid(order)) return { status: 400, body: { error: 'invalid order' } };
  const id = wmsOrderId(order.orderRef);
  if (orders.some((o) => o.orderRef === order.orderRef)) return { status: 200, body: { wmsOrderId: id } };
  orders.push({ ...order, wmsOrderId: id, receivedAt: now, steps: [] });
  return { status: 201, body: { wmsOrderId: id } };
}

export const nextStep = (order) => STEPS[order.steps.length] ?? null;

/** Now, but never before the last step; a delivery `lateDays` > 0 lands at 14:00 that many days after the promise date. */
export function stepTs(order, step, lateDays, now) {
  if (step === 'delivered' && lateDays > 0) return `${addDays(order.promiseDate, lateDays)} 14:00`;
  const last = order.steps.at(-1)?.ts;
  return last && TS.test(last) && last > now ? last : now;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tools/wms-simulator/`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the server**

`tools/wms-simulator/server.mjs`:

```js
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
```

- [ ] **Step 6: Write the page**

`tools/wms-simulator/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Simulated WMS</title>
  <style>
    :root { --bg: #f7f7f5; --fg: #1d1d1b; --muted: #6b6b66; --line: #ddddd8; --accent: #2f5d50; --bad: #a33a2b; }
    @media (prefers-color-scheme: dark) { :root { --bg: #161615; --fg: #ececea; --muted: #9a9a94; --line: #33332f; --accent: #7fbfa9; --bad: #e08070; } }
    body { margin: 0; padding: 24px 16px; background: var(--bg); color: var(--fg); font: 15px/1.45 system-ui, sans-serif; }
    main { max-width: 1040px; margin: 0 auto; }
    .badge { display: inline-block; padding: 2px 8px; border: 1px solid var(--accent); color: var(--accent); border-radius: 999px; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid var(--line); vertical-align: top; }
    th { color: var(--muted); font-weight: 500; font-size: 13px; }
    button { padding: 6px 12px; border: 0; border-radius: 6px; background: var(--accent); color: var(--bg); cursor: pointer; }
    button:disabled { opacity: .4; cursor: default; }
    input { width: 3.5em; }
    .err { color: var(--bad); font-size: 13px; }
    .wrap { overflow-x: auto; }
  </style>
</head>
<body>
<main>
  <h1>Simulated WMS and carriers</h1>
  <p><span class="badge">Synthetic data</span> Orders LateLens sent with "Send to WMS". Move each one on a step at a
    time; each step is reported to LateLens's order journey.</p>
  <div class="wrap">
    <table>
      <thead><tr><th>WMS order</th><th>LateLens ref</th><th>Client</th><th>From → to</th><th>Carrier</th><th>Promised</th><th>Steps done</th><th>Next</th></tr></thead>
      <tbody id="rows"><tr><td colspan="8">Loading…</td></tr></tbody>
    </table>
  </div>
</main>
<script>
  const rows = document.getElementById('rows');
  const errors = {};
  const text = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const label = { picked: 'Picked', picked_up: 'Handed to carrier', in_transit: 'In transit', out_for_delivery: 'Out for delivery', delivered: 'Delivered' };

  async function load() {
    const { orders } = await (await fetch('/sim/orders')).json();
    if (!orders.length) { rows.innerHTML = '<tr><td colspan="8">No orders yet. Approve an order in LateLens and click Send to WMS.</td></tr>'; return; }
    rows.innerHTML = orders.map((o) => {
      const ref = encodeURIComponent(o.orderRef);
      const late = o.next === 'delivered' ? ` late by <input id="late-${ref}" type="number" min="0" max="30" value="0"> days` : '';
      return `<tr>
        <td>${text(o.wmsOrderId)}</td><td>${text(o.orderRef)}</td><td>${text(o.clientId)}</td>
        <td>${text(o.warehouseId)} → ${text([o.destination?.city, o.destination?.state].filter(Boolean).join(', '))}</td>
        <td>${text(o.carrier)}</td><td>${text(o.promiseDate)}</td>
        <td>${o.steps.map((s) => `${text(label[s.event])} <small>${text(s.ts)}</small>`).join('<br>') || '—'}</td>
        <td>${o.next ? `<button data-ref="${ref}">${text(label[o.next])}</button>${late}` : 'Done'}
          ${errors[o.orderRef] ? `<div class="err">${text(errors[o.orderRef])}</div>` : ''}</td>
      </tr>`;
    }).join('');
  }

  rows.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-ref]');
    if (!btn) return;
    btn.disabled = true;
    const ref = btn.dataset.ref;
    const lateDays = Number(document.getElementById(`late-${ref}`)?.value ?? 0);
    const res = await fetch(`/sim/orders/${ref}/next`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lateDays }) });
    const body = await res.json().catch(() => ({}));
    errors[decodeURIComponent(ref)] = res.ok ? '' : `LateLens refused (${res.status}): ${body.error ?? 'no reason given'}`;
    await load();
  });

  load();
  setInterval(load, 5000);
</script>
</body>
</html>
```

- [ ] **Step 7: Add the scripts and ignore the data file**

In the root `package.json` `scripts`, after `"dev:all"`:

```json
    "dev:sim": "node --env-file-if-exists=.env tools/wms-simulator/server.mjs",
```

change `"test"` to:

```json
    "test": "npm --prefix backend/api test && npm --prefix frontend test && npm run test:py && npm run test:sim",
```

and after `"test:py"` add:

```json
    "test:sim": "node --test tools/wms-simulator/",
```

In `.gitignore`, under `# backend`, add:

```
tools/wms-simulator/data/
```

- [ ] **Step 8: Smoke-test the server on its own**

Run (one line; uses throwaway tokens and a port that LateLens does not use):

```bash
WMS_TOKEN=sim-test-token-0123456789 WMS_EVENTS_TOKEN=x-0123456789abcdef WMS_SIM_PORT=4199 node tools/wms-simulator/server.mjs & sleep 1; curl -s -X POST localhost:4199/orders -H 'authorization: Bearer sim-test-token-0123456789' -H 'content-type: application/json' -d '{"orderRef":"email:1","clientId":"C025","warehouseId":"W4","carrier":"E","commitment":"next_day","promiseDate":"2026-10-31","destination":{"city":"Boston","state":"MA","zip":"02110"},"items":[{"sku":"HX-616","qty":45}]}'; echo; curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:4199/orders -d '{}'; kill $!; rm -rf tools/wms-simulator/data
```

Expected: `{"wmsOrderId":"WMS-000001"}` then `401`.

- [ ] **Step 9: Commit**

```bash
git add tools/wms-simulator/store.mjs tools/wms-simulator/store.test.mjs tools/wms-simulator/server.mjs \
  tools/wms-simulator/index.html package.json .gitignore
git commit -m "feat(c): simulated WMS and carriers app, npm run dev:sim (design §9)"
```

---

### Task 6: SPEC and CONTRACTS, then the end-to-end check

**Files:**
- Modify: `docs/SPEC-order-workflow.md` (§4.2, §5.1, §5.2, §6, §7, §8, §11)
- Modify: `docs/CONTRACTS.md` (§5 table, §6 API table, §7 env vars, new WMS interface paragraph)
- Modify: `docs/SPEC.md` §12 (`[WMS_CONTRACT]` line)

**Interfaces:** none (documentation of Tasks 1–5).

- [ ] **Step 1: Update `docs/SPEC-order-workflow.md`**

- §4.2: replace the heading and everything up to `### 4.3` with:

```markdown
### 4.2 Stages 9–13 for new orders: the simulated WMS and carriers (synthetic)

Halcyon's WMS and carriers aren't connected (Q-002; carrier APIs are pitch only, SPEC §3), so a separate app plays
them: `tools/wms-simulator` (`npm run dev:sim`, local only). Design:
`docs/superpowers/specs/2026-10-30-order-journey-simulator-design.md`.

1. `send_to_wms` POSTs the approved order to `WMS_URL` (CONTRACTS §6, WMS interface) and records `wms_entered` with the
   WMS order number. Without `WMS_URL` it only sets the status, as before.
2. A person moves the order on in the simulator: `picked` → `picked_up` → `in_transit` → `out_for_delivery` →
   `delivered`. Each step reaches `POST /api/orders/:ref/events` and is stored in `order_events`, `synthetic = true`.
3. The journey shows stages 9–13 from those events. A delivery after the promise date fails stage 13 with the days
   late; none by the end of the promise date is `at_risk`.

Timings are whatever the person driving the simulator chooses; no headline figure reads `order_events`.
```

- §5.1: replace the REQ-JRN-05 row with
  `| REQ-JRN-05 | When `send_to_wms` runs with `WMS_URL` set, the API **MUST** hand the order to the WMS (CONTRACTS §6) and record one `wms_entered` event with its WMS order number; when the WMS does not accept it, the API **MUST** answer 503 and leave the status unchanged. Without `WMS_URL` it **MUST** behave as before (status only). |`;
  replace the REQ-JRN-10 row with `| REQ-JRN-10 | *(Dropped 30 Oct: timings come from the simulator, not `journey_timing`.)* |`;
  add after REQ-JRN-12:
  `| REQ-JRN-13 | `POST /api/orders/:ref/events` **MUST** accept `picked`, `picked_up`, `in_transit`, `out_for_delivery`, `delivered` for an order in the WMS, each only after the one before it and never earlier than it; a repeat with the same time **MUST** change nothing (200) and one with another time **MUST** be refused (409). |`
- §5.2: add after SEC-JRN-03:
  `| SEC-JRN-04 | `POST /api/orders/:ref/events` **MUST** need `Authorization: Bearer <WMS_EVENTS_TOKEN>` (401 without it, 503 when unset). The order sent to the WMS **MUST NOT** carry names, phone numbers, email addresses or a street line. |`
- §6: replace the AC-JRN-05 row and the AC-JRN-10 row, and add three rows after AC-JRN-12, copying the AC-JRN-05,
  AC-JRN-13, AC-SEC-JRN-04 and AC-JRN-14 rows from the design's §12 table (AC-JRN-10 becomes
  `| AC-JRN-10 | *(Dropped with REQ-JRN-10.)* |`).
- §7: in the diagram replace `order_events  ◀── written once at send_to_wms (Node, synthetic)` with
  `order_events  ◀── wms_entered at send_to_wms; later steps from the simulator (POST /api/orders/:ref/events)`;
  remove the `journey_timing (new)` line and the **Table `journey_timing`** bullet; replace the **Hook into WMS entry**
  bullet with `- **WMS entry:** `applyAction(… 'send_to_wms')` calls the WMS (`modules/intake/wms.ts`) and then C's
  `recordOrderEvent` (passed in, like `logOverride`); see the design §5.`
- §8: set the "Simulated stages 10–13" row's estimate column to `built 30 Oct (simulator)`.
- §11: replace the `[WMS_CONTRACT]` item with `- `[WMS_CONTRACT]`: closed 30 Oct, the assumed interface is in CONTRACTS §6.`

- [ ] **Step 2: Update `docs/CONTRACTS.md`**

- §5 table: change the `300–399` row's tables to `` `recommendations`, `override_log`, `order_events` ``, and add
  after the table's paragraph about D10:

```markdown
**Migration `301_order_events.sql`** (C; order journey simulator). Writer: `recordOrderEvent` in
`modules/carriers/index.ts`; intake calls it for `wms_entered`.

| Column | Type | Note |
|---|---|---|
| `id` | serial PK | |
| `order_ref` | text NOT NULL | `email:<id>` |
| `event` | text NOT NULL | `wms_entered` \| `picked` \| `picked_up` \| `in_transit` \| `out_for_delivery` \| `delivered`; unique per `order_ref` |
| `ts` | timestamp NOT NULL | local, no zone; `YYYY-MM-DD HH:mm` in the API |
| `detail` | jsonb NOT NULL | `wms_entered`: `{ wmsOrderId }` |
| `synthetic` | boolean NOT NULL DEFAULT true | always true: the WMS and carriers are simulated |
```

- §6 API table: add after the `POST /api/overrides` row:

```markdown
| `POST /api/orders/:ref/events` | C | Called by the simulated WMS and carriers. `Authorization: Bearer <WMS_EVENTS_TOKEN>` (401; 503 when unset). `:ref` = `email:<id>`. body `{ event: "picked" \| "picked_up" \| "in_transit" \| "out_for_delivery" \| "delivered", ts?: "YYYY-MM-DD HH:mm" }` → `201 { event, ts }`; `200` for a repeat with the same `ts`; `409 { error }` out of order, earlier than the previous event, a changed repeat, or not in the WMS; `404` unknown email; `400 { error: "invalid" }` |
```

  In the `POST /api/intake/:id/action` row, insert this sentence directly before `With \`CONFIRM_LINK=on\``:

```markdown
`send_to_wms` with `WMS_URL` set first hands the order to the WMS (below) and records `wms_entered`; 503 `{ error: "WMS not reachable" }` leaves the status unchanged; the audit row's payload holds `wmsOrderId`.
```

  Then add below the API table:

```markdown
**WMS interface (assumed, `[WMS_CONTRACT]`; served by `tools/wms-simulator`).** `POST {WMS_URL}/orders`,
`Authorization: Bearer <WMS_TOKEN>`, body `{ orderRef, clientId, warehouseId, carrier, commitment, promiseDate,
destination: { city, state, zip }, items: [{ sku, qty }] }` (no names, phones, emails or street) →
`201 { wmsOrderId }` (`WMS-` + six-digit email id), `200` with the same id for an `orderRef` already held. LateLens
waits 5 s; anything else is a failure.
```

- §7: append to the variables paragraph: `` `WMS_URL` (the simulated WMS, e.g. `http://localhost:4100`; empty =
  `send_to_wms` only sets the status), `WMS_TOKEN` and `WMS_EVENTS_TOKEN` (≥ 16 characters; read by the API and by
  `tools/wms-simulator`). ``

- [ ] **Step 3: Close `[WMS_CONTRACT]` in `docs/SPEC.md` §12**

Replace the line `` `[WMS_CONTRACT]`: Email owner to add the request and response shapes to `docs/CONTRACTS.md`. `` with:

```markdown
  `[WMS_CONTRACT]`: closed 30 Oct. The assumed interface is in `docs/CONTRACTS.md` §6 (WMS interface), served by the
  simulator `tools/wms-simulator` (design `docs/superpowers/specs/2026-10-30-order-journey-simulator-design.md`).
```

(keep the line's original indentation).

- [ ] **Step 4: Run every suite**

Run: `npm run typecheck && npm test`
Expected: all pass. Route tests that need Postgres must run, not skip: check the Vitest summary shows
`order-events.test.ts` with 3 passed.

- [ ] **Step 5: End-to-end check by hand**

In `.env`, set `WMS_URL=http://localhost:4100` and two random tokens (`openssl rand -hex 16` each) for `WMS_TOKEN`
and `WMS_EVENTS_TOKEN`. Then, in three terminals:

```bash
npm run dev:api
```

```bash
npm run dev:sim
```

```bash
npm run dev
```

1. Paste an ALL_CLEAR order on the Order emails screen (or fixture 02), approve it, then click Send to WMS. Expected:
   status ENTERED, and the order appears on `http://localhost:4100` with its `WMS-` number.
2. Stop the simulator, approve another order and click Send to WMS. Expected: the error "WMS not reachable" and the
   order stays Approved. Restart the simulator.
3. In the simulator, click through Picked → Delivered on the first order, with "late by 2 days" on the last step.
4. Open `/dashboard/journey/email:<id>`. Expected: stages 9–12 done with the "Synthetic data" label, stage 13 failed
   "Delivered 2 days late", and the note "Stages 9 to 13 come from the simulated WMS and carriers: synthetic data."

- [ ] **Step 6: Commit**

```bash
git add docs/SPEC-order-workflow.md docs/CONTRACTS.md docs/SPEC.md
git commit -m "docs: order journey simulator in SPEC-order-workflow and CONTRACTS; [WMS_CONTRACT] closed (REQ-JRN-05, -13, SEC-JRN-04)"
```
