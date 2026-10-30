# Order journey auto-advance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin switch on the Settings page that, when on, makes approving an ALL_CLEAR email order also enter it in
the (simulated) WMS and record steps 10–13, revealed in the order journey a few seconds apart.

**Architecture:** A new `settings` API module owns one table, `app_settings`. On `approve`, intake asks the setting
and, when on, calls the Carriers module's `autoAdvanceOrder`, which records all six `order_events` (wms_entered to delivered, with out_for_delivery) at once through the
existing writer, each with a `visible_at` 5 seconds after the one before. The journey reads only visible events and the
journey page refetches quietly until the order is delivered. No timers on the server.

**Tech Stack:** Node + Fastify + zod (`backend/api`), PostgreSQL migrations (`backend/db/migrations`), Vitest, Next.js +
React Testing Library (`frontend`).

**Spec:** `docs/superpowers/specs/2026-10-30-order-journey-auto-advance-design.md` (read it first).

**Depends on:** PR #86 (`fix-wms-without-reply`, "Send reply" for an order in the WMS whose reply has not gone out).
Without it, an order auto-advanced on approval cannot get its reply from the Intake screen. Merge #86 first, then branch
from `main`.

## Global Constraints

- Approval (step 7) and the reply to the client (step 8) stay a person's click. Only steps 9–13 are automatic.
- Every auto-advanced event is synthetic: `order_events.synthetic` stays `true`, the journey keeps its synthetic-data note
  (REQ-JRN-08), and the Settings card says "Synthetic".
- One writer per table: `order_events` only through `recordOrderEvent` (`modules/carriers/index.ts`); `app_settings`
  only through `modules/settings/repo.ts`.
- Name the AC ids a test covers in its test name; name the REQ ids in the PR description.
- Timestamps in the API are local, no zone, `YYYY-MM-DD HH:mm` (strings compare in time order).
- No secrets in code. Tests use the test values already in `test/token.ts` and `test/intake/wms.test.ts`.
- Route tests need the test database migrated: run `npm run migrate:test` from the repo root after adding a migration.
- Match the surrounding code: short doc comments that cite the design section, no new dependencies.

## File map

| File | Change | Task |
|---|---|---|
| `backend/db/migrations/302_app_settings.sql` | Create | 1 |
| `backend/api/src/modules/settings/repo.ts` | Create: `autoAdvanceOn`, `setAutoAdvance` | 1 |
| `backend/api/src/modules/settings/routes.ts` | Create: `GET /settings`, `POST /settings/auto-advance` | 1 |
| `backend/api/src/core/permissions.ts` | Two entries | 1 |
| `backend/api/test/routes/settings.test.ts` | Create | 1 |
| `backend/api/test/routes/permissions.test.ts` | Two expectations | 1 |
| `backend/db/migrations/303_order_events_visible_at.sql` | Create | 2 |
| `backend/api/src/modules/carriers/queries.ts` | `visibleOnly`, `visibleAt` | 2 |
| `backend/api/src/modules/carriers/index.ts` | `recordOrderEvent` takes `visibleAt` | 2 |
| `backend/api/src/modules/carriers/orderEvents.ts` | `FEED_EVENTS` comment | 2 |
| `backend/api/test/routes/auto-advance.test.ts` | Create | 2, 3 |
| `backend/api/src/modules/carriers/autoAdvance.ts` | Create: `autoAdvancePlan` | 3 |
| `backend/api/src/modules/carriers/index.ts` | `autoAdvanceOrder` | 3 |
| `backend/api/src/modules/carriers/journey.ts` | Step 9 wording for auto | 3 |
| `backend/api/test/carriers/autoAdvance.test.ts` | Create | 3 |
| `backend/api/test/carriers/journey.test.ts` | AC-JRN-18 | 3 |
| `backend/api/src/modules/intake/actions.ts` | `AutoAdvance`, approve hook, `send_to_wms` no-op | 4 |
| `backend/api/src/modules/intake/routes.ts` | Wire it, pass `warning` | 4 |
| `backend/api/test/intake/wms.test.ts` | New describe; second-click expectation | 4 |
| `frontend/hooks/useApi.ts` | `refresh()` | 5 |
| `frontend/components/dashboard/journey/JourneyScreen.tsx` | Poll while moving | 5 |
| `frontend/components/dashboard/journey/JourneyScreen.test.tsx` | Polling test | 5 |
| `frontend/lib/auth/roles.ts` | `settings` UI action | 6 |
| `frontend/components/dashboard/settings/AutoAdvanceCard.tsx` | Create | 6 |
| `frontend/components/dashboard/settings/AutoAdvanceCard.test.tsx` | Create | 6 |
| `frontend/app/dashboard/settings/page.tsx` | Render the card | 6 |
| `docs/SPEC-order-workflow.md`, `docs/SPEC-auth.md`, `docs/SPEC.md`, `docs/CONTRACTS.md`, simulator design | Requirements, matrix, log, contracts | 7 |

---

### Task 1: The setting (table, API, permissions)

**Files:**
- Create: `backend/db/migrations/302_app_settings.sql`
- Create: `backend/api/src/modules/settings/repo.ts`
- Create: `backend/api/src/modules/settings/routes.ts`
- Modify: `backend/api/src/core/permissions.ts`
- Test: `backend/api/test/routes/settings.test.ts`, `backend/api/test/routes/permissions.test.ts`

**Interfaces:**
- Produces: `autoAdvanceOn(): Promise<boolean>` and `setAutoAdvance(enabled: boolean, actor: AuthUser): Promise<void>`
  in `modules/settings/repo.ts`; `GET /api/settings` → `{ autoAdvance: boolean }`; `POST /api/settings/auto-advance`
  with `{ enabled: boolean }` → `{ autoAdvance: boolean }` (admin only).

- [ ] **Step 1: Write the failing route test**

Create `backend/api/test/routes/settings.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool, query } from '../../src/core/db/pool.js';
import { buildApp } from '../../src/server.js';
import { hasDb } from '../db.js';
import { AUTH_ON, bearer } from '../token.js';

describe.skipIf(!hasDb)('settings routes (needs test database)', () => {
  let app: FastifyInstance;
  const as = (roles: string[]) => bearer({ sub: `u-${roles.join('-')}`, name: 'Test user', roles });
  const set = async (enabled: unknown, roles: string[]) => app.inject({ method: 'POST', url: '/api/settings/auto-advance',
    headers: await as(roles), payload: { enabled } });
  const audits = async () => (await query<{ n: number }>(
    "SELECT count(*)::int AS n FROM audit_log WHERE action = 'set_auto_advance'"))[0].n;

  beforeAll(async () => {
    await query("DELETE FROM app_settings WHERE key = 'auto_advance'");
    app = await buildApp({ auth: AUTH_ON });
  });
  afterAll(async () => {
    // Leave it off: other route tests approve orders and expect APPROVED.
    await query("DELETE FROM app_settings WHERE key = 'auto_advance'");
    await app.close();
    await pool.end();
  });

  it('AC-SET-01: off by default, and every role can read it', async () => {
    for (const r of ['order_desk', 'leadership', 'admin']) {
      const res = await app.inject({ method: 'GET', url: '/api/settings', headers: await as([r]) });
      expect(res.json(), r).toEqual({ autoAdvance: false });
    }
  });

  it('AC-SET-01: only an admin can change it, with one audit row; a refusal writes nothing', async () => {
    const before = await audits();
    for (const r of ['order_desk', 'warehouse_supervisor', 'carrier_manager', 'customer_support', 'leadership']) {
      expect((await set(true, [r])).statusCode, r).toBe(403);
    }
    expect(await audits()).toBe(before);
    expect((await set('yes', ['admin'])).statusCode).toBe(400);
    expect((await set(true, ['admin'])).json()).toEqual({ autoAdvance: true });
    expect(await audits()).toBe(before + 1);
    const [row] = await query<{ actor: string; enabled: boolean }>(
      `SELECT actor, (payload->>'enabled')::boolean AS enabled FROM audit_log
        WHERE action = 'set_auto_advance' ORDER BY id DESC LIMIT 1`);
    expect(row).toEqual({ actor: 'u-admin', enabled: true });
    const read = await app.inject({ method: 'GET', url: '/api/settings', headers: await as(['order_desk']) });
    expect(read.json()).toEqual({ autoAdvance: true });
  });
});
```

In `backend/api/test/routes/permissions.test.ts`, in the test `REQ-AUTH-05: the matrix matches SPEC-auth §4.2, ...`,
after `expect(who('POST', '/api/assistant')).toEqual(ROLES); ...` add:

```ts
    expect(who('GET', '/api/settings')).toEqual(ROLES);
    expect(who('POST', '/api/settings/auto-advance')).toEqual(['admin']);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend/api && npx vitest run test/routes/settings.test.ts test/routes/permissions.test.ts`
Expected: FAIL — `relation "app_settings" does not exist` (settings) and `expected null to deeply equal [...]`
(permissions).

- [ ] **Step 3: Add the migration**

Create `backend/db/migrations/302_app_settings.sql`:

```sql
-- Owner C. App-wide switches an admin sets (design docs/superpowers/specs/2026-10-30-order-journey-auto-advance-design.md §4).
-- Writer: modules/settings only. No row means the setting is off.
CREATE TABLE app_settings (
  key text PRIMARY KEY,                       -- 'auto_advance'
  value jsonb NOT NULL,                       -- auto_advance: true | false
  updated_by text NOT NULL,                   -- user id from the session (REQ-AUTH-07)
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

Run: `npm run migrate:test` (repo root). Expected: `302_app_settings.sql` listed as applied.

- [ ] **Step 4: Add the repo and routes**

Create `backend/api/src/modules/settings/repo.ts`:

```ts
// App settings (design docs/superpowers/specs/2026-10-30-order-journey-auto-advance-design.md §4): the one writer of
// app_settings. Python never reads or writes it.
import type { AuthUser } from '../../core/contracts.js';
import { query } from '../../core/db/pool.js';

/** Off unless an admin switched it on (no row is off). */
export async function autoAdvanceOn(): Promise<boolean> {
  const rows = await query<{ value: unknown }>("SELECT value FROM app_settings WHERE key = 'auto_advance'");
  return rows[0]?.value === true;
}

/** SEC-SET-01: the change and its audit row are one statement, so neither is written without the other. */
export async function setAutoAdvance(enabled: boolean, actor: AuthUser): Promise<void> {
  await query(
    `WITH s AS (
       INSERT INTO app_settings (key, value, updated_by) VALUES ('auto_advance', $1::jsonb, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()
       RETURNING key)
     INSERT INTO audit_log (actor, action, ref, payload)
     SELECT $2, 'set_auto_advance', 'setting:auto_advance', $3::jsonb FROM s`,
    [JSON.stringify(enabled), actor.id, JSON.stringify({ enabled, name: actor.name, roles: actor.roles })]);
}
```

Create `backend/api/src/modules/settings/routes.ts`:

```ts
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { actorOf } from '../../core/auth.js';
import { autoAdvanceOn, setAutoAdvance } from './repo.js';

const AutoAdvanceBody = z.object({ enabled: z.boolean() }).strict();

// Roles for every route: core/permissions.ts, checked in server.ts before the handler runs (SPEC-auth §4.2).
const routes: FastifyPluginAsync = async (app) => {
  app.get('/settings', async () => ({ autoAdvance: await autoAdvanceOn() }));

  app.post('/settings/auto-advance', async (req, reply) => {
    const body = AutoAdvanceBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'enabled must be true or false' });
    await setAutoAdvance(body.data.enabled, actorOf(req));
    req.log.info({ setting: 'auto_advance', enabled: body.data.enabled }, 'setting changed');
    return { autoAdvance: body.data.enabled };
  });
};

export default routes;
```

`core/modules.ts` registers every `modules/<area>/routes.ts` under `/api`, so nothing else is needed to mount it.

In `backend/api/src/core/permissions.ts`, after `const SUPPORT: ...` add:

```ts
const ADMIN: readonly Role[] = ['admin']; // App settings (design 2026-10-30-order-journey-auto-advance §4, SEC-SET-01)
```

and in `PERMISSIONS`, after `'GET /api/tracking': { roles: CARRIER_READ },` add:

```ts
  'GET /api/settings': { roles: ALL }, // the Settings page shows every role the switch's state
```

and after the `'POST /api/alerts/run'` entry add:

```ts
  'POST /api/settings/auto-advance': { roles: ADMIN, legacyKey: true },
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend/api && npx vitest run test/routes/settings.test.ts test/routes/permissions.test.ts`
Expected: PASS (including `AC-AUTH-06: every registered route ... has an entry`).

- [ ] **Step 6: Commit**

```bash
git add backend/db/migrations/302_app_settings.sql backend/api/src/modules/settings backend/api/src/core/permissions.ts backend/api/test/routes/settings.test.ts \
  backend/api/test/routes/permissions.test.ts
git commit -m "feat(settings): admin switch for order journey auto-advance (SEC-SET-01)"
```

---

### Task 2: Order events shown over time (`visible_at`)

**Files:**
- Create: `backend/db/migrations/303_order_events_visible_at.sql`
- Modify: `backend/api/src/modules/carriers/queries.ts` (`orderEventRows`, `insertOrderEvent`, `emailFacts`)
- Modify: `backend/api/src/modules/carriers/index.ts` (`recordOrderEvent`)
- Modify: `backend/api/src/modules/carriers/orderEvents.ts` (comment only)
- Test: `backend/api/test/routes/auto-advance.test.ts`

**Interfaces:**
- Produces: `orderEventRows(orderRefs: string[], o?: { visibleOnly?: boolean })`;
  `insertOrderEvent(orderRef: string, e: OrderEventRow, visibleAt?: Date): Promise<boolean>`;
  `recordOrderEvent(o: { orderRef: string; event: OrderEvent; ts?: string; detail?: Record<string, unknown>; visibleAt?: Date })`.

- [ ] **Step 1: Write the failing test**

Create `backend/api/test/routes/auto-advance.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool, query } from '../../src/core/db/pool.js';
import { recordOrderEvent } from '../../src/modules/carriers/index.js';
import { buildApp } from '../../src/server.js';
import { hasDb } from '../db.js';

// Design docs/superpowers/specs/2026-10-30-order-journey-auto-advance-design.md §7: events with a visible_at in the future
// are written, ordered and repeat-checked, but not shown in the journey yet.
describe.skipIf(!hasDb)('order events shown over time (needs test database)', () => {
  let app: FastifyInstance;
  const KEYS = ['wms', 'picked', 'handed', 'transit', 'delivered'];
  const newEmail = async (tag: string) => (await query<{ id: number }>(
    `INSERT INTO intake_emails (source, from_addr, subject, body, received_at, hash, status)
     VALUES ('paste', 'orders@client025.example', '[SYNTHETIC] auto-advance test', '[SYNTHETIC] auto-advance test',
             '2026-10-30 07:30', $1, 'ENTERED') RETURNING id`, [`auto-advance-${tag}-${Date.now()}`]))[0].id;
  const stages = async (id: number) => {
    const j = (await app.inject({ method: 'GET', url: `/api/journey/email:${id}` })).json() as
      { stages: { key: string; status: string }[] };
    return KEYS.map((k) => j.stages.find((s) => s.key === k)?.status);
  };

  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); await pool.end(); });

  it('REQ-JRN-15: a step whose visible_at is still ahead is left out of the journey, but the writer orders after it', async () => {
    const id = await newEmail('hidden');
    const ref = `email:${id}`;
    const later = new Date(Date.now() + 60_000);
    expect((await recordOrderEvent({ orderRef: ref, event: 'wms_entered', ts: '2026-10-30 09:00',
      detail: { wmsOrderId: 'WMS-TEST' } })).code).toBe(201);
    expect((await recordOrderEvent({ orderRef: ref, event: 'picked', ts: '2026-10-30 10:00', visibleAt: later })).code).toBe(201);
    // The writer sees the hidden `picked`, so `picked_up` is accepted after it.
    expect((await recordOrderEvent({ orderRef: ref, event: 'picked_up', ts: '2026-10-30 15:00', visibleAt: later })).code).toBe(201);
    expect(await stages(id)).toEqual(['done', 'current', 'not_reached', 'not_reached', 'not_reached']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend/api && npx vitest run test/routes/auto-advance.test.ts`
Expected: FAIL — the journey shows `picked` and `handed` as `done`/`current` (`visibleAt` is ignored), or a type error
on `visibleAt`.

- [ ] **Step 3: Add the migration**

Create `backend/db/migrations/303_order_events_visible_at.sql`:

```sql
-- Owner C. When an order event shows in the journey (design docs/superpowers/specs/2026-10-30-order-journey-auto-advance-design.md §7).
-- Auto-advance sets it a few seconds apart; every other writer leaves the default, so its events show at once as before.
ALTER TABLE order_events ADD COLUMN visible_at timestamptz NOT NULL DEFAULT now();
```

Run: `npm run migrate:test` (repo root).

- [ ] **Step 4: Read and write `visible_at`**

In `backend/api/src/modules/carriers/queries.ts`, replace `orderEventRows` and `insertOrderEvent` with:

```ts
/**
 * Every row by default: the writer's order and repeat check must see steps not shown yet (auto-advance design §7).
 * `visibleOnly` leaves those out, for the journey.
 */
export const orderEventRows = (orderRefs: string[], o: { visibleOnly?: boolean } = {}) => query<OrderEventRow>(
  `SELECT event, ${ts('ts')} AS ts, detail FROM order_events
    WHERE order_ref = ANY($1)${o.visibleOnly ? ' AND visible_at <= now()' : ''} ORDER BY ts, id`, [orderRefs]);

/** False when the (order_ref, event) row already exists: two racing requests write one row. */
export async function insertOrderEvent(orderRef: string, e: OrderEventRow, visibleAt?: Date): Promise<boolean> {
  const rows = await query<{ id: number }>(
    `INSERT INTO order_events (order_ref, event, ts, detail, visible_at)
     VALUES ($1, $2, $3::timestamp, $4, coalesce($5::timestamptz, now()))
     ON CONFLICT (order_ref, event) DO NOTHING RETURNING id`,
    [orderRef, e.event, e.ts, JSON.stringify(e.detail), visibleAt?.toISOString() ?? null]);
  return rows.length === 1;
}
```

In `emailFacts` (same file), change `const events = await orderEventRows(refs);` to:

```ts
  const events = await orderEventRows(refs, { visibleOnly: true });
```

In `backend/api/src/modules/carriers/index.ts`, change `recordOrderEvent`'s parameter type to

```ts
export async function recordOrderEvent(o: { orderRef: string; event: OrderEvent; ts?: string; detail?: Record<string, unknown>;
  visibleAt?: Date }): Promise<EventCheck & { ts: string }> {
```

and its insert line to

```ts
  if (await insertOrderEvent(o.orderRef, { event: o.event, ts, detail: o.detail ?? {} }, o.visibleAt)) return { code: 201, ts };
```

In `backend/api/src/modules/carriers/orderEvents.ts`, change the comment above `FEED_EVENTS` to:

```ts
/** The events the simulator may post. `wms_entered` is written only by send_to_wms and by auto-advance. */
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend/api && npx vitest run test/routes/auto-advance.test.ts test/routes/order-events.test.ts test/routes/journey.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/db/migrations/303_order_events_visible_at.sql backend/api/src/modules/carriers backend/api/test/routes/auto-advance.test.ts
git commit -m "feat(journey): order events can be shown from a later time (REQ-JRN-15)"
```

---

### Task 3: The auto-advance plan and recorder (Carriers)

**Files:**
- Create: `backend/api/src/modules/carriers/autoAdvance.ts`
- Modify: `backend/api/src/modules/carriers/index.ts` (add `autoAdvanceOrder`)
- Modify: `backend/api/src/modules/carriers/journey.ts` (step 9 wording)
- Test: `backend/api/test/carriers/autoAdvance.test.ts`, `backend/api/test/carriers/journey.test.ts`,
  `backend/api/test/routes/auto-advance.test.ts`

**Interfaces:**
- Consumes: `recordOrderEvent({ ..., visibleAt })` (Task 2); `addDays`, `CUTOFF_HOUR` from `modules/warehouse/domain.ts`.
- Produces: `autoAdvancePlan(i: AutoAdvanceInput): PlannedEvent[]` and `STEP_SECONDS = 5` in `carriers/autoAdvance.ts`;
  `autoAdvanceOrder(o: { orderRef: string; receivedAt: string; promiseDate: string; wmsOrderId: string }, now?: Date):
  Promise<{ ok: boolean; error?: string }>` in `carriers/index.ts`.

- [ ] **Step 1: Write the failing unit tests**

Create `backend/api/test/carriers/autoAdvance.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { autoAdvancePlan, type AutoAdvanceInput } from '../../src/modules/carriers/autoAdvance.js';

const plan = (o: Partial<AutoAdvanceInput> = {}) => autoAdvancePlan({ receivedAt: '2026-10-28 07:15', promiseDate: '2026-10-29',
  approvedAt: '2026-10-28 09:40', wmsOrderId: 'WMS-000007', ...o });

describe('auto-advance plan (design 2026-10-30-order-journey-auto-advance §6)', () => {
  it('AC-JRN-15: five steps in order, at realistic times, shown 5 seconds apart, delivered on the promise date', () => {
    expect(plan().map((e) => [e.event, e.ts, e.showAfterSec])).toEqual([
      ['wms_entered', '2026-10-28 09:40', 0], ['picked', '2026-10-28 10:00', 5], ['picked_up', '2026-10-28 15:00', 10],
      ['in_transit', '2026-10-28 16:00', 15], ['delivered', '2026-10-29 12:00', 20]]);
    expect(plan()[0].detail).toEqual({ wmsOrderId: 'WMS-000007', auto: true });
    expect(plan()[4].detail).toEqual({ auto: true });
  });

  it('an order received at or after the 08:00 cut-off is picked the next day', () => {
    expect(plan({ receivedAt: '2026-10-28 08:00', promiseDate: '2026-10-30' })[1].ts).toBe('2026-10-29 10:00');
  });

  it('REQ-JRN-15: an approval after the pick time moves the later steps to it, never earlier than the step before', () => {
    expect(plan({ approvedAt: '2026-10-28 17:30' }).map((e) => e.ts)).toEqual(
      ['2026-10-28 17:30', '2026-10-28 17:30', '2026-10-28 17:30', '2026-10-28 17:30', '2026-10-29 12:00']);
  });

  it('AC-JRN-18: an approval after the promise date delivers an hour after transit; the data is not bent to look on time', () => {
    expect(plan({ approvedAt: '2026-10-30 09:00' }).map((e) => e.ts)).toEqual(
      ['2026-10-30 09:00', '2026-10-30 09:00', '2026-10-30 15:00', '2026-10-30 16:00', '2026-10-30 17:00']);
  });
});
```

In `backend/api/test/carriers/journey.test.ts`, add `import { autoAdvancePlan } from '../../src/modules/carriers/autoAdvance.js';`
to the imports, and inside `describe('new order journey', ...)` add:

```ts
  it('AC-JRN-18: an auto-advanced order says so at step 9, and a delivery after the promise date shows late', () => {
    const auto: EmailFacts = { ...EMAIL, status: 'ENTERED',
      approvals: [{ action: 'approve', actor: 'desk', at: '2026-10-30 09:00', reason: null },
        { action: 'send_to_wms', actor: 'system:auto-advance', at: '2026-10-30 09:00', reason: null }],
      events: autoAdvancePlan({ receivedAt: EMAIL.receivedAt, promiseDate: '2026-10-29', approvedAt: '2026-10-30 09:00',
        wmsOrderId: 'WMS-000008' }).map(({ event, ts, detail }) => ({ event, ts, detail })) };
    const j = buildEmailJourney(auto, '2026-10-30 18:00');
    expect(byKey(j, 'wms')).toMatchObject({ status: 'done', actor: 'Auto-advance (simulated)', source: 'synthetic',
      detail: 'Entered in the simulated WMS as WMS-000008 automatically.' });
    expect(byKey(j, 'delivered')).toMatchObject({ status: 'failed', detail: 'Delivered 1 day late (promised 2026-10-29).' });
  });
```

In `backend/api/test/routes/auto-advance.test.ts`, add `autoAdvanceOrder` to the import from
`'../../src/modules/carriers/index.js'` and add inside the `describe`:

```ts
  it('AC-JRN-17: 7 s after approval steps 9–10 are done and 11 is current; 21 s after, it is delivered', async () => {
    const order = (id: number, n: string) => ({ orderRef: `email:${id}`, receivedAt: '2026-10-30 07:30',
      promiseDate: '2026-11-03', wmsOrderId: `WMS-${n}` });
    const early = await newEmail('early');
    expect(await autoAdvanceOrder(order(early, 'T1'), new Date(Date.now() - 7_000))).toEqual({ ok: true });
    expect(await stages(early)).toEqual(['done', 'done', 'current', 'not_reached', 'not_reached']);
    const late = await newEmail('late');
    expect(await autoAdvanceOrder(order(late, 'T2'), new Date(Date.now() - 21_000))).toEqual({ ok: true });
    expect(await stages(late)).toEqual(['done', 'done', 'done', 'done', 'done']);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend/api && npx vitest run test/carriers/autoAdvance.test.ts test/carriers/journey.test.ts test/routes/auto-advance.test.ts`
Expected: FAIL — `Cannot find module '../../src/modules/carriers/autoAdvance.js'` and `autoAdvanceOrder is not a function`.

- [ ] **Step 3: Write the plan**

Create `backend/api/src/modules/carriers/autoAdvance.ts`:

```ts
// Auto-advance (design docs/superpowers/specs/2026-10-30-order-journey-auto-advance-design.md §6): the synthetic steps 9–13
// an approved order gets when the admin switch is on. Pure: index.ts records them.
import { addDays, CUTOFF_HOUR } from '../warehouse/domain.js';
import type { OrderEvent } from './orderEvents.js';

/** Seconds between one auto-advanced step showing in the journey and the next. */
export const STEP_SECONDS = 5;

export interface AutoAdvanceInput { receivedAt: string; promiseDate: string; approvedAt: string; wmsOrderId: string }
export interface PlannedEvent { event: OrderEvent; ts: string; detail: Record<string, unknown>; showAfterSec: number }

const plusHour = (ts: string) =>
  new Date(Date.parse(`${ts.replace(' ', 'T')}:00Z`) + 3_600_000).toISOString().slice(0, 16).replace('T', ' ');
/** Never earlier than the step before. `YYYY-MM-DD HH:mm` strings compare in time order. */
const notBefore = (ts: string, floor: string) => (ts < floor ? floor : ts);

/**
 * Picked on the pick-list day at 10:00 (the received day, or the next one from the 08:00 cut-off), collected at 15:00,
 * in transit at 16:00, delivered on the promise date at 12:00. A step that would come before the one before it moves up
 * to it; a delivery that would come before transit is an hour after it, and the journey then shows it late.
 */
export function autoAdvancePlan({ receivedAt, promiseDate, approvedAt, wmsOrderId }: AutoAdvanceInput): PlannedEvent[] {
  const received = receivedAt.slice(0, 10);
  const pickDay = Number(receivedAt.slice(11, 13)) >= CUTOFF_HOUR ? addDays(received, 1) : received;
  const picked = notBefore(`${pickDay} 10:00`, approvedAt);
  const day = picked.slice(0, 10);
  const pickedUp = notBefore(`${day} 15:00`, picked);
  const inTransit = notBefore(`${day} 16:00`, pickedUp);
  const promised = `${promiseDate} 12:00`;
  const delivered = promised < inTransit ? plusHour(inTransit) : promised;
  const steps: [OrderEvent, string][] = [['wms_entered', approvedAt], ['picked', picked], ['picked_up', pickedUp],
    ['in_transit', inTransit], ['delivered', delivered]];
  return steps.map(([event, ts], i) => ({ event, ts, showAfterSec: i * STEP_SECONDS,
    detail: event === 'wms_entered' ? { wmsOrderId, auto: true } : { auto: true } }));
}
```

- [ ] **Step 4: Record it**

In `backend/api/src/modules/carriers/index.ts`, add `import { autoAdvancePlan } from './autoAdvance.js';` with the
other imports (and `localNow` to the existing import from `./orderEvents.js` if it is not imported yet), and after
`recordOrderEvent` add:

```ts
/**
 * Auto-advance (design 2026-10-30-order-journey-auto-advance §5–§7): records steps 9–13 for an approved order through
 * recordOrderEvent, each shown STEP_SECONDS after the one before. "already recorded" counts as done.
 */
export async function autoAdvanceOrder(o: { orderRef: string; receivedAt: string; promiseDate: string; wmsOrderId: string },
  now = new Date()): Promise<{ ok: boolean; error?: string }> {
  for (const e of autoAdvancePlan({ ...o, approvedAt: localNow(now) })) {
    const r = await recordOrderEvent({ orderRef: o.orderRef, event: e.event, ts: e.ts, detail: e.detail,
      visibleAt: new Date(now.getTime() + e.showAfterSec * 1000) });
    if (r.code !== 201 && r.code !== 200 && r.error !== 'already recorded') {
      return { ok: false, error: `${e.event}: ${r.error ?? r.code}` };
    }
  }
  return { ok: true };
}
```

- [ ] **Step 5: Word step 9 for an auto-advanced order**

In `backend/api/src/modules/carriers/journey.ts`, in `buildEmailJourney`, after `const entered = ev('wms_entered');` add:

```ts
  const auto = entered?.detail.auto === true; // auto-advance design §8
```

and replace the `entered ? { ... }` branch of `wms:` with:

```ts
      : entered ? { status: 'done', at: entered.ts, actor: auto ? 'Auto-advance (simulated)' : wms?.actor ?? 'Operator',
        source: 'synthetic',
        detail: `Entered in the simulated WMS as ${String(entered.detail.wmsOrderId ?? `WMS-${e.id}`)}${auto ? ' automatically' : ''}.` }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend/api && npx vitest run test/carriers test/routes/auto-advance.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/api/src/modules/carriers backend/api/test/carriers backend/api/test/routes/auto-advance.test.ts
git commit -m "feat(journey): auto-advance plan for steps 9-13, recorded with staggered visibility (AC-JRN-15, -17, -18)"
```

---

### Task 4: Run it on approval (Intake)

**Files:**
- Modify: `backend/api/src/modules/intake/actions.ts`
- Modify: `backend/api/src/modules/intake/routes.ts`
- Test: `backend/api/test/intake/wms.test.ts`

**Interfaces:**
- Consumes: `autoAdvanceOn` (Task 1), `autoAdvanceOrder` (Task 3).
- Produces: `export interface AutoAdvance { on: () => Promise<boolean>; run: (o: { orderRef: string; receivedAt: string;
  promiseDate: string; wmsOrderId: string }) => Promise<{ ok: boolean; error?: string }> }`; `ActionOptions.autoAdvance?:
  AutoAdvance`; `ActionResult.warning?: string`; `POST /api/intake/:id/action` answers `{ status, warning? }`.

- [ ] **Step 1: Write the failing tests**

In `backend/api/test/intake/wms.test.ts`:

1. Change the import to `import { applyAction, type AutoAdvance, type OrderEventLog } from '../../src/modules/intake/actions.js';`.
2. In `AC-JRN-05: the WMS accepts: ...`, replace the second-click block

```ts
    // A second click: the order is ENTERED, so it is refused and nothing more is sent or recorded.
    expect(await applyAction(t.mem.repo, t.id, 'send_to_wms', sup, undefined, { wms: t.wms, orderEvents: t.orderEvents }))
      .toMatchObject({ code: 409 });
```

with

```ts
    // AC-JRN-19: a second click finds the order ENTERED: 200, and nothing more is sent or recorded.
    expect(await applyAction(t.mem.repo, t.id, 'send_to_wms', sup, undefined, { wms: t.wms, orderEvents: t.orderEvents }))
      .toEqual({ code: 200, status: 'ENTERED' });
```

3. At the end of the file add:

```ts
describe('auto-advance on approval (design 2026-10-30-order-journey-auto-advance §5)', () => {
  const desk: AuthUser = { id: 'd1', name: 'Dee Desk', roles: ['order_desk'], demo: false };

  /** An ALL_CLEAR order awaiting approval, and a fake auto-advance that records what it was asked to run. */
  async function pending(on: boolean, result: { ok: boolean; error?: string } = { ok: true }) {
    const mem = memoryRepo({ 'client025.example': C025 }, []);
    const r = await processEmail({ from: 'orders@client025.example', subject: '[SYNTHETIC] Order', body: BODY, receivedAt: '2026-10-22 07:30' },
      { llm, pii, maps, repo: mem.repo, warehouse, carriers, gmail: null });
    const runs: Parameters<AutoAdvance['run']>[0][] = [];
    const autoAdvance: AutoAdvance = { on: async () => on, run: async (o) => { runs.push(o); return result; } };
    const approve = () => applyAction(mem.repo, r.id, 'approve', desk, undefined, { autoAdvance });
    return { mem, id: r.id, runs, approve };
  }

  it('AC-JRN-15: switch on: approval enters the order and runs steps 10–13, the entry recorded as system:auto-advance', async () => {
    const t = await pending(true);
    expect(await t.approve()).toEqual({ code: 200, status: 'ENTERED' });
    expect(t.runs).toEqual([{ orderRef: `email:${t.id}`, receivedAt: '2026-10-22 07:30',
      promiseDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), wmsOrderId: `WMS-${String(t.id).padStart(6, '0')}` }]);
    expect((await t.mem.repo.getEmail(t.id))?.status).toBe('ENTERED');
    expect(t.mem.audit.slice(-2).map((a) => [a.action, a.user])).toEqual([['approve', 'd1'], ['send_to_wms', 'system:auto-advance']]);
  });

  it('AC-JRN-16: switch off: approval only approves, and nothing runs', async () => {
    const t = await pending(false);
    expect(await t.approve()).toEqual({ code: 200, status: 'APPROVED' });
    expect(t.runs).toEqual([]);
  });

  it('a failed run keeps the approval, leaves the order APPROVED and says to send it by hand', async () => {
    const t = await pending(true, { ok: false, error: 'picked: db down' });
    expect(await t.approve()).toEqual({ code: 200, status: 'APPROVED',
      warning: 'Auto-advance did not run (picked: db down): send it to the WMS by hand.' });
    expect((await t.mem.repo.getEmail(t.id))?.status).toBe('APPROVED');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend/api && npx vitest run test/intake/wms.test.ts`
Expected: FAIL — `AutoAdvance` is not exported; the second click returns 409.

- [ ] **Step 3: Add the hook in `actions.ts`**

In `backend/api/src/modules/intake/actions.ts`:

Change `ActionResult` to

```ts
export interface ActionResult { code: 200 | 400 | 403 | 404 | 409 | 503; status?: string; error?: string; cause?: string; warning?: string }
```

After the `OrderEventLog` type add:

```ts
/**
 * Auto-advance (design 2026-10-30-order-journey-auto-advance §5): whether the admin switch is on (modules/settings), and the
 * Carriers module's `autoAdvanceOrder`, which records steps 9–13 through the one writer of order_events.
 */
export interface AutoAdvance {
  on: () => Promise<boolean>;
  run: (o: { orderRef: string; receivedAt: string; promiseDate: string; wmsOrderId: string }) => Promise<{ ok: boolean; error?: string }>;
}
```

Add `autoAdvance?: AutoAdvance;` to `ActionOptions` (after `orderEvents?: OrderEventLog;`) and add to its doc comment:
`` `autoAdvance`: after an approval, enters the order and runs steps 10–13 when the switch is on. ``

Above `applyAction`, add:

```ts
/**
 * Design 2026-10-30-order-journey-auto-advance §5: with the switch on, an approved ALL_CLEAR order goes straight into the
 * (simulated) WMS and gets steps 10–13; the external WMS (WMS_URL) is not called. The approval is already saved, so if
 * recording fails the order stays APPROVED for a person to send to the WMS.
 */
async function afterApproval(repo: Repo, email: EmailRow, x: ExtractionRow | null, auto?: AutoAdvance): Promise<ActionResult> {
  const approved: ActionResult = { code: 200, status: 'APPROVED' };
  if (x?.decision !== 'ALL_CLEAR' || !auto || !(await auto.on())) return approved;
  const order = wmsOrder(email, x);
  if (!order) return approved;
  const wmsOrderId = `WMS-${String(email.id).padStart(6, '0')}`;
  const r = await auto.run({ orderRef: order.orderRef, receivedAt: email.received_at, promiseDate: order.promiseDate, wmsOrderId });
  if (!r.ok) return { ...approved, warning: `Auto-advance did not run (${r.error ?? 'no reason given'}): send it to the WMS by hand.` };
  await repo.setStatus(email.id, 'ENTERED');
  await repo.logApproval(email.id, 'send_to_wms', 'system:auto-advance', { wmsOrderId, auto: true });
  return { code: 200, status: 'ENTERED' };
}
```

In the `approve` branch, replace its final `return { code: 200, status: 'APPROVED' };` with:

```ts
    return afterApproval(repo, email, x, opts.autoAdvance);
```

Directly above `const ready = action === 'send_reply' ? ...`, add:

```ts
  // AC-JRN-19: already in the WMS (auto-advance on approval, or a second click): nothing to do. Lets "Approve & send"
  // finish its approve → send_reply → send_to_wms chain when the approval entered the order.
  if (action === 'send_to_wms' && email.status === 'ENTERED') return { code: 200, status: 'ENTERED' };
```

- [ ] **Step 4: Wire it in `routes.ts`**

In `backend/api/src/modules/intake/routes.ts`:

```ts
import { autoAdvanceOrder, logOverride, recordOrderEvent } from '../carriers/index.js';
import { autoAdvanceOn } from '../settings/repo.js';
```

(replacing the existing `logOverride, recordOrderEvent` import), and in the action route:

```ts
      { edited: body.data.reply, reason: body.data.reason, carrier: body.data.carrier, overrides: logOverride,
        wms, orderEvents: recordOrderEvent, autoAdvance: { on: autoAdvanceOn, run: autoAdvanceOrder } });
    req.log.info({ emailId: Number(req.params.id), action: body.data.action, carrier: body.data.carrier ?? null, code: result.code,
      error: result.error ?? null, cause: result.cause ?? null, warning: result.warning ?? null }, 'intake action');
    return reply.code(result.code).send(result.error ? { error: result.error }
      : { status: result.status, ...(result.warning ? { warning: result.warning } : {}) });
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend/api && npx vitest run test/intake test/routes/intake.test.ts test/routes/permissions.test.ts`
Expected: PASS (the route tests run with the switch off, since Task 1's test deletes its row).

- [ ] **Step 6: Commit**

```bash
git add backend/api/src/modules/intake backend/api/test/intake/wms.test.ts
git commit -m "feat(intake): approval auto-advances an ALL_CLEAR order when the switch is on (AC-JRN-15, -16, -19)"
```

---

### Task 5: The journey page fills in on its own

**Files:**
- Modify: `frontend/hooks/useApi.ts`
- Modify: `frontend/components/dashboard/journey/JourneyScreen.tsx`
- Test: `frontend/components/dashboard/journey/JourneyScreen.test.tsx`

**Interfaces:**
- Produces: `useApi(...)` also returns `refresh(): void` — fetches again without a loading state; an error keeps the
  last data.

- [ ] **Step 1: Write the failing test**

In `frontend/components/dashboard/journey/JourneyScreen.test.tsx`, add `vi` to the `vitest` import, and add
`vi.useRealTimers();` to the existing `afterEach` (create `afterEach(() => { cleanup(); vi.useRealTimers(); });` if it
only calls `cleanup`). Then add inside the top-level `describe`:

```ts
  it('REQ-JRN-15: refetches a new order every 5 seconds while its steps appear, and stops once it is delivered', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const order = (delivered: string) => ({ ref: 'email:8', kind: 'order', synthetic: true, rounds: [],
      summary: { clientId: 'C003', tier: 'Tier 2', channel: 'Email', commitment: 'same_day', destination: 'Detroit, MI, 48226',
        promisedDate: '2026-10-29', outcome: 'entered' },
      stages: D000213.stages.map((st) => (st.n === 9 ? { ...st, status: 'done' } : st.n === 13 ? { ...st, status: delivered }
        : st.n > 9 && st.n < 13 ? { ...st, status: 'not_reached' } : st)) });
    const routes: Record<string, unknown> = { '/api/journey/email:8': order('not_reached'), '/api/intake': INBOX };
    const fetch = mockApi(routes);
    const loads = () => fetch.mock.calls.filter(([u]) => String(u).endsWith('/api/journey/email:8')).length;
    renderScreen(<JourneyScreen initialRef="email:8" />);
    await screen.findByRole('heading', { level: 1 });
    expect(loads()).toBe(1);
    routes['/api/journey/email:8'] = order('done');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(loads()).toBe(2);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(loads()).toBe(2);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx vitest run components/dashboard/journey/JourneyScreen.test.tsx`
Expected: FAIL — `expected 1 to be 2`.

- [ ] **Step 3: Add `refresh()` to `useApi`**

Replace `frontend/hooks/useApi.ts` with:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { getJSON } from '@/lib/api';

/**
 * Loads `path` from the API; `null` skips loading. `reload()` fetches again. `refresh()` does too but keeps what is shown:
 * no loading state, and an error keeps the last answer (for polling). A new `path` always loads normally.
 */
export function useApi<T>(path: string | null): { data?: T; error?: string; loading: boolean; reload: () => void; refresh: () => void } {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: path != null });
  const [tick, setTick] = useState({ n: 0, quiet: false });
  const lastPath = useRef(path);
  useEffect(() => {
    if (!path) return;
    const quiet = tick.quiet && lastPath.current === path;
    lastPath.current = path;
    let live = true;
    if (!quiet) setState((s) => ({ ...s, loading: true }));
    getJSON<T>(path)
      .then((data) => live && setState({ data, loading: false }))
      .catch((e: Error) => live && setState((s) => (quiet ? s : { error: e.message, loading: false })));
    return () => {
      live = false;
    };
  }, [path, tick]);
  const reload = useCallback(() => setTick((t) => ({ n: t.n + 1, quiet: false })), []);
  const refresh = useCallback(() => setTick((t) => ({ n: t.n + 1, quiet: true })), []);
  return { ...state, reload, refresh };
}
```

- [ ] **Step 4: Poll in `JourneyScreen`**

In `frontend/components/dashboard/journey/JourneyScreen.tsx`, make sure `useEffect` is in the `react` import, add near
the other module constants:

```ts
/** Auto-advance (REQ-JRN-15): a new order's steps show 5 s apart, so it is refetched that often, for at most a minute. */
const POLL_MS = 5_000;
const POLL_FOR_MS = 60_000;
```

and in `JourneyScreen`, after `const j = useApi<Journey>(\`/api/journey/${ref}\`);`, add:

```ts
  // A new order in the WMS that is not delivered yet may still be filling in (auto-advance): refetch it quietly.
  const moving = j.data?.kind === 'order' && j.data.stages.some((x) => x.key === 'wms' && x.status === 'done')
    && !j.data.stages.some((x) => x.key === 'delivered' && (x.status === 'done' || x.status === 'failed'));
  const { refresh } = j;
  useEffect(() => {
    if (!moving) return;
    const every = setInterval(refresh, POLL_MS);
    const stop = setTimeout(() => clearInterval(every), POLL_FOR_MS);
    return () => {
      clearInterval(every);
      clearTimeout(stop);
    };
  }, [moving, ref, refresh]);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run components/dashboard/journey hooks`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/hooks/useApi.ts frontend/components/dashboard/journey
git commit -m "feat(journey): refetch a new order while its auto-advanced steps appear (REQ-JRN-15)"
```

---

### Task 6: The Settings card

**Files:**
- Modify: `frontend/lib/auth/roles.ts`
- Create: `frontend/components/dashboard/settings/AutoAdvanceCard.tsx`
- Modify: `frontend/app/dashboard/settings/page.tsx`
- Test: `frontend/components/dashboard/settings/AutoAdvanceCard.test.tsx`

**Interfaces:**
- Consumes: `GET /api/settings`, `POST /api/settings/auto-advance` (Task 1); `useApi` (Task 5).
- Produces: `UiAction` `'settings'` (admin); `<AutoAdvanceCard />`.

- [ ] **Step 1: Write the failing test**

Create `frontend/components/dashboard/settings/AutoAdvanceCard.test.tsx`:

```tsx
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { asRole, mockApi, renderScreen } from '../test-utils';
import { AutoAdvanceCard } from './AutoAdvanceCard';

/** The bodies POSTed to the setting, in order. */
const posts = (fetch: ReturnType<typeof mockApi>) => (fetch.mock.calls as unknown as [string, RequestInit?][])
  .filter(([url, init]) => url.endsWith('/api/settings/auto-advance') && init?.method === 'POST')
  .map(([, init]) => JSON.parse(String(init!.body)));
const toggle = async () => {
  const sw = await screen.findByRole('switch', { name: /Auto-advance approved orders/ }) as HTMLInputElement;
  return sw;
};

describe('Auto-advance setting', () => {
  afterEach(cleanup);

  it('AC-SET-02: an admin turns it on', async () => {
    const fetch = mockApi({ '/api/settings': { autoAdvance: false }, '/api/settings/auto-advance': { autoAdvance: true } });
    renderScreen(<AutoAdvanceCard />, asRole('admin'));
    const sw = await toggle();
    await waitFor(() => expect(sw.disabled).toBe(false));
    fireEvent.click(sw);
    await waitFor(() => expect(posts(fetch)).toEqual([{ enabled: true }]));
    expect(sw.checked).toBe(true);
  });

  it('AC-SET-02: the order desk sees the state but cannot change it', async () => {
    mockApi({ '/api/settings': { autoAdvance: true } });
    renderScreen(<AutoAdvanceCard />, asRole('order_desk'));
    const sw = await toggle();
    await waitFor(() => expect(sw.checked).toBe(true));
    expect(sw.disabled).toBe(true);
    expect(screen.getByText('Only an admin can change this.')).toBeTruthy();
  });

  it('a failed save puts the switch back and says why', async () => {
    mockApi({ '/api/settings': { autoAdvance: false } }); // the POST path is not mapped: 404
    renderScreen(<AutoAdvanceCard />, asRole('admin'));
    const sw = await toggle();
    await waitFor(() => expect(sw.disabled).toBe(false));
    fireEvent.click(sw);
    expect((await screen.findByRole('alert')).textContent).toMatch(/^Not saved/);
    expect(sw.checked).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx vitest run components/dashboard/settings`
Expected: FAIL — `Failed to resolve import "./AutoAdvanceCard"`.

- [ ] **Step 3: Add the UI action**

In `frontend/lib/auth/roles.ts`, add `settings: ['admin'],` to the `UI` map (after `triage: [...]`) and `| 'settings'` to
`UiAction`.

- [ ] **Step 4: Write the card**

Create `frontend/components/dashboard/settings/AutoAdvanceCard.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useCan } from '@/components/auth/UserContext';
import ui from '@/components/dashboard/ui.module.css';
import { useApi } from '@/hooks/useApi';
import { postJSON } from '@/lib/api';

interface Settings { autoAdvance: boolean }

/**
 * Design 2026-10-30-order-journey-auto-advance §9: the switch that moves approved orders through the simulated WMS and
 * carriers. Every role sees its state; only an admin changes it (SEC-SET-01; the API refuses anyone else anyway).
 */
export function AutoAdvanceCard() {
  const settings = useApi<Settings>('/api/settings');
  const canChange = useCan('settings');
  const [shown, setShown] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const on = shown ?? settings.data?.autoAdvance ?? false;

  const change = async (enabled: boolean) => {
    setShown(enabled);
    setSaving(true);
    setError(null);
    try {
      await postJSON<Settings>('/api/settings/auto-advance', { enabled });
    } catch (e) {
      setShown(!enabled);
      setError(e instanceof Error ? e.message : 'the change was not saved');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={ui.card}>
      <h2 className={ui.cardTitle}>Order journey</h2>
      <p className={ui.lede}>
        Synthetic: the API stands in for the WMS and carriers. Approval and the reply to the client stay manual.
      </p>
      <label className={ui.row}>
        <input type="checkbox" role="switch" checked={on} disabled={!canChange || saving || settings.loading}
          onChange={(e) => change(e.target.checked)} />
        Auto-advance approved orders through the WMS and carriers
      </label>
      {!canChange && <p className={ui.lede}>Only an admin can change this.</p>}
      {error && <p className={ui.lede} role="alert">Not saved: {error}</p>}
    </section>
  );
}
```

- [ ] **Step 5: Show it on the Settings page**

In `frontend/app/dashboard/settings/page.tsx`, add `import { AutoAdvanceCard } from '@/components/dashboard/settings/AutoAdvanceCard';`
and render `<AutoAdvanceCard />` directly after the Profile `</section>`. Update the page's doc comment from
"Read-only." to "Read-only, except the admin's auto-advance switch."

- [ ] **Step 6: Run the tests and typecheck**

Run: `cd frontend && npx vitest run components/dashboard/settings && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/lib/auth/roles.ts frontend/components/dashboard/settings frontend/app/dashboard/settings/page.tsx
git commit -m "feat(settings): Order journey card with the admin auto-advance switch (AC-SET-02)"
```

---

### Task 7: Specs, contracts and discovery log

**Files:**
- Modify: `docs/SPEC-order-workflow.md`, `docs/SPEC-auth.md`, `docs/SPEC.md`, `docs/CONTRACTS.md`,
  `docs/superpowers/specs/2026-10-30-order-journey-simulator-design.md`

- [ ] **Step 1: Requirements and ACs**

In `docs/SPEC-order-workflow.md`, after the `REQ-JRN-13` row add:

```markdown
| REQ-JRN-14 | An admin **MAY** switch on auto-advance (Settings). While it is on, approving an ALL_CLEAR order **MUST** enter it in the WMS and record steps 10–13 as synthetic events; approval and the reply **MUST** stay manual. Design: `docs/superpowers/specs/2026-10-30-order-journey-auto-advance-design.md`. |
| REQ-JRN-15 | Auto-advanced steps **MUST** become visible 5 seconds apart and **MUST NOT** carry a timestamp earlier than the step before. Delivery **SHOULD** be on the promise date; when it cannot be, the order **MUST** show as late. |
```

after the `SEC-JRN-04` row add:

```markdown
| SEC-SET-01 | Only an admin **MUST** be able to change the auto-advance setting, and every change **MUST** be written to `audit_log` with its actor. |
```

and after the `AC-JRN-14` row add:

```markdown
| AC-JRN-15 | Given the switch on and an ALL_CLEAR order with promise, warehouse and carrier, when it is approved, then the status is `ENTERED`, six events are recorded in order with non-decreasing `ts` shown 0/5/10/15/20/25 s after approval, and the audit has `send_to_wms` by `system:auto-advance` |
| AC-JRN-16 | Given the switch off, when an order is approved, then the status is `APPROVED` and nothing is auto-advanced |
| AC-JRN-17 | Given auto-advanced events and now = approval + 7 s, then steps 9–10 are `done`, 11 `current`, 12–13 `not_reached`; at + 26 s step 13 is `done` |
| AC-JRN-18 | Given an approval after the promise date, then `delivered` comes an hour after `in_transit` and step 13 is `failed` "N days late"; step 9 says "Auto-advance (simulated)" |
| AC-JRN-19 | Given an order already `ENTERED`, when `send_to_wms` is posted, then 200 `ENTERED` and nothing new is sent or written |
| AC-SET-01 | `POST /api/settings/auto-advance` is 403 for every role but admin and writes nothing; for admin it saves and writes one `set_auto_advance` audit row |
| AC-SET-02 | The Settings card toggles the switch for an admin and is read-only for the order desk |
```

Then run `grep -n "second click\|refused.*ENTERED\|409.*send_to_wms" docs/SPEC-order-workflow.md docs/superpowers/specs/2026-10-30-order-journey-simulator-design.md`
and change any text saying a second `send_to_wms` on an `ENTERED` order is refused to "returns 200 and does nothing (AC-JRN-19)".

- [ ] **Step 2: Permission matrix**

In `docs/SPEC-auth.md` §4.2, after the `Enter an approved order in the WMS` row add:

```markdown
| Turn auto-advance on or off | `POST /api/settings/auto-advance` | | | | | | Y | Yes (SEC-SET-01) |
```

and add `GET /api/settings` (every role) to the read rows or §4.4 list, wherever `GET /api/journey/:ref` is listed.

- [ ] **Step 3: Contracts**

In `docs/CONTRACTS.md` §5, change the `300–399` row's tables to `` `recommendations`, `override_log`, `order_events`, `app_settings` ``,
add a `visible_at | timestamptz NOT NULL DEFAULT now() | when the journey shows the event (303; auto-advance)` row to the
`order_events` column table, and add after it:

```markdown
**Migration `302_app_settings.sql`** (C; auto-advance). Writer: `modules/settings/repo.ts`. One row, `auto_advance`
(`true` | `false`); no row is off. `GET /api/settings` → `{ autoAdvance }` (every role);
`POST /api/settings/auto-advance` `{ enabled }` → `{ autoAdvance }` (admin; audited as `set_auto_advance`).
```

- [ ] **Step 4: Simulator design and discovery log**

In `docs/superpowers/specs/2026-10-30-order-journey-simulator-design.md`, after the line beginning
`Decisions taken with the user (30 Oct): manual steps, not a clock;` add a paragraph:

```markdown
Later on 30 Oct: when an admin switches on **auto-advance**, approval runs steps 9–13 itself and this simulator is not
used for those orders (`2026-10-30-order-journey-auto-advance-design.md`). With the switch off, this design applies.
```

In `docs/SPEC.md` §14.1, append a row:

```markdown
| 30 Oct | Can steps 9–13 (WMS entry to delivery) run on their own after approval, from a Settings switch? | Carriers owner (Priyank) | Yes, as a demo aid: an admin-only switch, off by default; steps shown 5 s apart, synthetic, on time; approval and the reply stay manual | REQ-JRN-14/15, SEC-SET-01 (`SPEC-order-workflow.md`); design and plan `2026-10-30-order-journey-auto-advance`; `app_settings` (302), `order_events.visible_at` (303) |
```

- [ ] **Step 5: Run every suite**

Run (repo root): `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add docs
git commit -m "docs: auto-advance requirements, permissions, contracts and discovery log (REQ-JRN-14, -15, SEC-SET-01)"
```
