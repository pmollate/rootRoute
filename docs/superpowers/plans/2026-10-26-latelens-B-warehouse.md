# LateLens — Resource B (Warehouse & promise + platform) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared platform everyone codes on, the diagnostic engine and replay that produce every headline number, the warehouse and promise rules, and the Overview, Warehouses and Replay & decision screens.

**Architecture:** Python (`analytics/`) computes every table from the supplied CSVs and writes it to Postgres; Node (`api/`) serves those tables and applies order-time rules; React (`web/`) only calls the API. B owns the skeleton of all three, `analytics/core` + `analytics/warehouse`, `api/src/modules/warehouse`, and three screens.

**Tech Stack:** Python 3.12, pandas, SQLAlchemy + psycopg, pytest, ruff · Node 22, TypeScript (strict, ESM, NodeNext), Fastify 5, pg, zod 4, Vitest · React 19, Vite, React Router 7, Recharts 3, Testing Library · PostgreSQL 16 (Docker locally).

**Read first:** `docs/SPEC.md` (§1.4 per-cause KPIs, §2 evidence, §3 features, §5.1, §5.4, §5.7, §5.8, §5.11, §5.12), `docs/CONTRACTS.md` (all of it — you own §1, §4 core/warehouse rows, §6 B rows, §7).

**Prototype status:** every code block below was run before this plan was written: Python tests pass against the supplied data, Node/web code typechecks and its unit tests pass. Tests marked "needs test database" were written but could not run on the planning machine (no Postgres); CI runs them.

## Global Constraints

- Every number shown to users is computed from `Halcyon-Hackathon-Dataset/` by Python. Never hard-code a figure in Node or React.
- Never edit `Halcyon-Hackathon-Dataset/`. Synthetic data lives in `synthetic-data/` and never feeds the replay (REQ-REP-04).
- Flag definitions are exactly SPEC §5.1: five causes (`f_addr`, `f_stock`, `f_cutoff`, `f_lane` = bad lane or D on a Friday, `f_route` = >20% over plan). Golden numbers are SPEC §2.2 and §2.4; tests check them to 0.1 point.
- Timestamps are local strings `YYYY-MM-DD HH:mm`; no time zones anywhere (pg type parsers return dates as strings).
- TypeScript: ESM with `.js` import suffixes, `strict: true`. Python: 3.12+, ruff clean (`ruff.toml`).
- Each table has one writer (CONTRACTS §4–5). Python tables are replaced in one transaction per pipeline run.
- Tests name the acceptance criteria they cover (`AC-…`). Commit messages `feat(b): …`.
- Secrets only in `.env` (gitignored) or Key Vault. `.env.example` has no real keys.
- **This Mac:** `~/.npm` has root-owned files. Fix once before `npm install`: `sudo chown -R $(id -u):$(id -g) ~/.npm`.

## File Structure (B creates or owns)

```
package.json · docker-compose.yml · db/init/01-test-db.sql · .env.example · .gitignore · requirements.txt · pytest.ini · ruff.toml · README.md (run section)
.github/workflows/ci.yml
db/migrations/001_core.sql
api/  package.json tsconfig.json vitest.config.ts test/setup.ts test/db.ts test/platform.test.ts
      src/index.ts src/server.ts
      src/core/{config,auth,cache,contracts,modules}.ts  src/core/db/{pool,migrate,migrate-cli}.ts
      src/modules/warehouse/{index,domain,lookups,queries,routes}.ts      (carriers/index.ts stub only, C replaces)
      test/warehouse/domain.test.ts  test/routes/{warehouse,placement}.test.ts
web/  package.json tsconfig.json vite.config.ts index.html public/staticwebapp.config.json
      src/main.tsx src/app/{App,features,api,format,ui,test-utils}.ts(x) src/app/styles.css src/app/app.test.tsx
      src/features/{health,overview,warehouses,replay}/index.tsx (+ tests)
analytics/__init__.py  analytics/pipeline.py
analytics/core/{__init__,load,context,db,diagnosis,ifixed,scenarios,build}.py
analytics/warehouse/{__init__,tables,stock}.py   (stub __init__.py for carriers and intake, replaced by C and A)
analytics/tests/{conftest,test_load,test_diagnosis,test_scenarios,test_warehouse,test_stock,test_pipeline}.py
synthetic-data/generators/sd05_stock.py  synthetic-data/README.md
```

## Schedule

| Day | Tasks | Others waiting on you |
|---|---|---|
| Mon 26 | B1, B2, B3, B4 | **Everyone** — push B1–B3 to `main` as early as possible (target: before lunch) |
| Tue 27 | B5, B6, B7, B8 | C needs `fair` flags (B3); A needs real `warehouseApi` (B8) |
| Wed 28 | B9, B10, B11 | — |
| Thu 29 AM | B12, then overview plan §6 (submission) | — |

---

### Task B1: API skeleton, database and contracts

**Files:**
- Create: `package.json`, `docker-compose.yml`, `db/init/01-test-db.sql`, `.env.example`, `.gitignore` (replace), `db/migrations/001_core.sql`
- Create: `api/package.json`, `api/tsconfig.json`, `api/vitest.config.ts`, `api/test/setup.ts`, `api/test/db.ts`
- Create: `api/src/index.ts`, `api/src/server.ts`, `api/src/core/config.ts`, `api/src/core/auth.ts`, `api/src/core/cache.ts`, `api/src/core/contracts.ts`, `api/src/core/modules.ts`, `api/src/core/db/pool.ts`, `api/src/core/db/migrate.ts`, `api/src/core/db/migrate-cli.ts`
- Create (stubs): `api/src/modules/warehouse/index.ts`, `api/src/modules/carriers/index.ts`
- Test: `api/test/platform.test.ts`

**Interfaces:**
- Produces: `buildApp(): Promise<FastifyInstance>`; `query<T>(sql, params): Promise<T[]>`, `pool`, `dbOk()`; `migrate(): Promise<string[]>`; `cached(key, load)`, `clearCache()`; `requireApiKey` preHandler; `config`, `allowList`; every type in `core/contracts.ts` (CONTRACTS §1); module autoload: any `api/src/modules/<area>/routes.ts` default-exporting a `FastifyPluginAsync` is mounted under `/api`.
- Produces (stubs, CONTRACTS §2): `warehouseApi`, `diagnosisApi`, `carriersApi`.

- [ ] **Step 1: Root files.** Create `package.json`:

```json
{
  "name": "latelens",
  "private": true,
  "workspaces": ["api", "web"],
  "scripts": {
    "dev": "concurrently -n api,web -c blue,green \"npm run dev -w api\" \"npm run dev -w web\"",
    "test": "npm test -w api && npm test -w web",
    "lint": "npm run lint -w api && npm run lint -w web"
  }
}
```

`docker-compose.yml` and `db/init/01-test-db.sql`:

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: latelens
      POSTGRES_PASSWORD: latelens
      POSTGRES_DB: latelens
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./db/init:/docker-entrypoint-initdb.d:ro
volumes:
  pgdata:
```

```sql
-- Runs once when the Docker volume is created: a second database for tests.
CREATE DATABASE latelens_test;
```

`.env.example` (then `cp .env.example .env`):

```bash
# Copy to .env (never commit .env). See docs/CONTRACTS.md §7.
DATABASE_URL=postgres://latelens:latelens@localhost:5432/latelens
TEST_DATABASE_URL=postgres://latelens:latelens@localhost:5432/latelens_test
PORT=3001

# AI model: claude | azure-openai | recorded (recorded replays api/test/recordings, no key needed)
LLM_PROVIDER=recorded
LLM_MODEL=claude-opus-5-5
ANTHROPIC_API_KEY=
AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_DEPLOYMENT=
RECORD=

# Shared demo key for write endpoints, and who replies may be sent to
API_KEY=dev-key
ALLOW_LIST=ops-test@latelens.example,orders@client190.example

# Web (the demo key is visible in the browser: synthetic data only)
VITE_API_URL=http://localhost:3001
VITE_API_KEY=dev-key
```

`.gitignore` (replaces the current one):

```bash
node_modules
.env
.venv/
__pycache__/
.DS_Store
*.pyc
dist/
synthetic-data/out/
web/bots/out/
web/test-results/
web/playwright-report/
```

- [ ] **Step 2: Install the API packages.**

```bash
mkdir -p api && cd api
npm init -y >/dev/null
npm install fastify @fastify/cors pg zod dotenv @anthropic-ai/sdk
npm install -D typescript tsx vitest @types/pg @types/node
cd .. && npm install -D concurrently
```

Then replace `api/package.json` scripts so it reads:

```json
{
  "name": "@latelens/api",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "migrate": "tsx src/core/db/migrate-cli.ts",
    "migrate:test": "tsx src/core/db/migrate-cli.ts --test",
    "test": "vitest run",
    "lint": "tsc --noEmit -p tsconfig.json"
  }
}
```

(keep the `dependencies` / `devDependencies` npm wrote). `api/tsconfig.json` and `api/vitest.config.ts`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node"]
  },
  "include": ["src"]
}
```

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { setupFiles: ['test/setup.ts'], fileParallelism: false },
});
```

- [ ] **Step 3: Write the failing test.** `api/test/setup.ts`, `api/test/db.ts`, `api/test/platform.test.ts`:

```ts
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';

loadEnv({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://latelens:latelens@localhost:5432/latelens_test';
process.env.NODE_ENV = 'test';
process.env.LLM_PROVIDER = 'recorded';
process.env.API_KEY = 'test-key';
process.env.ALLOW_LIST = 'ops-test@latelens.example,orders@client190.example';
```

```ts
import { dbOk } from '../src/core/db/pool.js';

/** Route tests need the test database filled by `python -m analytics.pipeline --test-db` and migrations. */
export const hasDb = await dbOk();
```

```ts
import { afterAll, describe, expect, it } from 'vitest';
import { migrate } from '../src/core/db/migrate.js';
import { pool } from '../src/core/db/pool.js';
import { buildApp } from '../src/server.js';
import { hasDb } from './db.js';

describe.skipIf(!hasDb)('platform (needs test database)', () => {
  afterAll(() => pool.end());

  it('health reports the database and AI provider', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ db: 'ok', llm: 'recorded' });
  });

  it('migrations are idempotent', async () => {
    await migrate();
    expect(await migrate()).toEqual([]);
    const { rows } = await pool.query("SELECT to_regclass('public.audit_log') AS t");
    expect(rows[0].t).toBe('audit_log');
  });
});
```

- [ ] **Step 4: Run it to make sure it fails.**

Run: `docker compose up -d && npm test -w api`
Expected: FAIL — `Cannot find module '../src/core/db/pool.js'`.

- [ ] **Step 5: Core modules.** `api/src/core/config.ts`:

```ts
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const Env = z.object({
  NODE_ENV: z.string().default('development'),
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(3001),
  LLM_PROVIDER: z.enum(['claude', 'azure-openai', 'recorded']).default('recorded'),
  LLM_MODEL: z.string().default('claude-opus-5-5'),
  RECORD: z.string().optional(),
  API_KEY: z.string().min(1),
  ALLOW_LIST: z.string().default(''),
});

export const config = Env.parse(process.env);
export const allowList = new Set(
  config.ALLOW_LIST.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
);
```

`api/src/core/db/pool.ts`:

```ts
import pg from 'pg';
import { config } from '../config.js';

// Return bigint/numeric as numbers and dates/timestamps as the strings Postgres sends (no time-zone shifts).
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(1114, (v) => v);

export const pool = new pg.Pool({ connectionString: config.DATABASE_URL });

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool.query<T>(text, params);
  return res.rows;
}

export async function dbOk(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
```

`api/src/core/db/migrate.ts` and `api/src/core/db/migrate-cli.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const DIR = fileURLToPath(new URL('../../../../db/migrations/', import.meta.url));

/** Apply db/migrations/*.sql in name order, once each. Returns the files applied this run. */
export async function migrate(): Promise<string[]> {
  const client = await pool.connect();
  try {
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const done = new Set(
      (await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name),
    );
    const applied: string[] = [];
    for (const file of readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
      if (done.has(file)) continue;
      await client.query('BEGIN');
      try {
        await client.query(readFileSync(DIR + file, 'utf8'));
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
    return applied;
  } finally {
    client.release();
  }
}
```

```ts
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';

loadEnv({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)), quiet: true });
if (process.argv.includes('--test')) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const { migrate } = await import('./migrate.js');
const { pool } = await import('./pool.js');
try {
  const applied = await migrate();
  console.log(applied.length ? `applied: ${applied.join(', ')}` : 'up to date');
} finally {
  await pool.end();
}
```

`api/src/core/modules.ts`, `api/src/core/auth.ts`, `api/src/core/cache.ts`:

```ts
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

const EXT = import.meta.url.endsWith('.ts') ? 'ts' : 'js';

/** Register every api/src/modules/<area>/routes.(ts|js) under the /api prefix. */
export async function registerModules(app: FastifyInstance): Promise<string[]> {
  const dir = fileURLToPath(new URL('../modules/', import.meta.url));
  const loaded: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const file = `${dir}${name}/routes.${EXT}`;
    if (!existsSync(file)) continue;
    const mod = (await import(pathToFileURL(file).href)) as { default: FastifyPluginAsync };
    await app.register(mod.default, { prefix: '/api' });
    loaded.push(name);
  }
  return loaded;
}
```

```ts
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from './config.js';

/** preHandler for write endpoints: requires the shared demo key in x-api-key. */
export async function requireApiKey(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (req.headers['x-api-key'] !== config.API_KEY) {
    await reply.code(401).send({ error: 'unauthorized' });
  }
}
```

```ts
const store = new Map<string, Promise<unknown>>();

/** Memoise a read of data that never changes while the server runs (Python-computed tables). */
export function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (!store.has(key)) {
    store.set(
      key,
      load().catch((err: unknown) => {
        store.delete(key);
        throw err;
      }),
    );
  }
  return store.get(key) as Promise<T>;
}

export function clearCache(): void {
  store.clear();
}
```

`api/src/core/contracts.ts` (must match CONTRACTS §1):

```ts
// Shared types between problem areas. Source of truth: docs/CONTRACTS.md §1.
export type Commitment = 'same_day' | 'next_day' | 'standard';
export type Region = 'Midwest' | 'Northeast' | 'Southeast' | 'West';
export type WarehouseId = 'W1' | 'W2' | 'W3' | 'W4' | 'W5';
export type CarrierId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

/** Local warehouse time as written in the data: "YYYY-MM-DD HH:mm". */
export type LocalTimestamp = string;
/** "YYYY-MM-DD" */
export type IsoDate = string;

export interface PromiseResult {
  promiseDate: IsoDate;
  commitment: Commitment;
  downgraded: boolean;
  reason: string | null;
}

export interface PickWarehouseInput {
  destinationRegion: Region;
  nearestWarehouseId: WarehouseId;
  stock: Partial<Record<WarehouseId, boolean>>;
}

export interface WarehouseChoice {
  warehouseId: WarehouseId;
  reason: string;
  warnClient: boolean;
}

export interface RecommendInput {
  region: Region;
  commitment: Commitment;
  slaClause: boolean;
  date?: IsoDate;
}

export interface CarrierOption {
  carrier: CarrierId;
  onTime: number;
  meanRate: number;
  n: number;
  score: number | null;
  status: 'recommended' | 'backup' | 'eligible' | 'blocked';
  reason: string;
}

export interface CarrierRecommendation {
  carrier: CarrierId;
  backup: CarrierId;
  reason: string;
  blocked: CarrierId[];
  options: CarrierOption[];
}

export type CauseFlag =
  | 'f_addr' | 'f_cutoff' | 'f_stock' | 'f_stock_out' | 'f_skip_nearest' | 'f_lane' | 'f_bad_lane' | 'f_d_friday' | 'f_route';

export interface DeliveryCauses {
  deliveryId: string;
  late: boolean;
  flags: Record<CauseFlag, boolean>;
  stages: string[];
}

export interface WarehouseApi {
  checkPromise(commitment: Commitment, receivedAt: LocalTimestamp): PromiseResult;
  nearestWarehouse(clientId: string, region: Region): Promise<WarehouseId>;
  pickWarehouse(input: PickWarehouseInput): Promise<WarehouseChoice>;
}

export interface CarriersApi {
  recommendCarrier(input: RecommendInput): Promise<CarrierRecommendation>;
}

export interface DiagnosisApi {
  getDeliveryCauses(deliveryId: string): Promise<DeliveryCauses | null>;
}
```

`api/src/server.ts` and `api/src/index.ts`:

```ts
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { config } from './core/config.js';
import { dbOk } from './core/db/pool.js';
import { registerModules } from './core/modules.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: config.NODE_ENV !== 'test' });
  await app.register(cors, { origin: true });
  app.get('/api/health', async () => ({
    db: (await dbOk()) ? 'ok' : 'down',
    llm: config.LLM_PROVIDER,
    version: process.env.GIT_SHA ?? 'dev',
  }));
  await registerModules(app);
  return app;
}
```

```ts
import { config } from './core/config.js';
import { buildApp } from './server.js';

const app = await buildApp();
await app.listen({ port: config.PORT, host: '0.0.0.0' });
```

`db/migrations/001_core.sql`:

```sql
-- Owner B. Node-owned core tables. Python-owned tables are created by analytics/pipeline.py (CONTRACTS §4).
CREATE TABLE audit_log (
  id serial PRIMARY KEY,
  actor text NOT NULL,
  action text NOT NULL,
  ref text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

- [ ] **Step 6: Contract stubs** so A and C can code against them today. `api/src/modules/warehouse/index.ts`:

```ts
// Public entry point of the Warehouse & promise area (CONTRACTS §2). STUB until Task B8.
import type { DiagnosisApi, Region, WarehouseApi, WarehouseId } from '../../core/contracts.js';

const NEAREST: Record<Region, WarehouseId> = { Midwest: 'W1', Northeast: 'W4', Southeast: 'W3', West: 'W5' };

function plusOneDay(receivedAt: string): string {
  return new Date(Date.parse(`${receivedAt.slice(0, 10)}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

export const warehouseApi: WarehouseApi = {
  checkPromise: (commitment, receivedAt) => ({ promiseDate: plusOneDay(receivedAt), commitment, downgraded: false, reason: null }),
  nearestWarehouse: async (_clientId, region) => NEAREST[region],
  pickWarehouse: async (input) => ({ warehouseId: input.nearestWarehouseId, reason: 'stub', warnClient: false }),
};

export const diagnosisApi: DiagnosisApi = { getDeliveryCauses: async () => null };
```

`api/src/modules/carriers/index.ts`:

```ts
// Public entry point of the Carriers area (CONTRACTS §2). STUB until Task C4.
import type { CarriersApi } from '../../core/contracts.js';

export const carriersApi: CarriersApi = {
  recommendCarrier: async () => ({ carrier: 'A', backup: 'B', reason: 'stub', blocked: [], options: [] }),
};
```

- [ ] **Step 7: Run the tests and the server.**

Run: `npm run migrate:test -w api && npm test -w api && npm run lint -w api`
Expected: PASS (2 tests), no type errors.
Run: `npm run migrate -w api && npm run dev -w api`, then `curl localhost:3001/api/health`
Expected: `{"db":"ok","llm":"recorded","version":"dev"}`

- [ ] **Step 8: Commit and push to `main` (PR).**

```bash
git add package.json package-lock.json docker-compose.yml db .env.example .gitignore api
git commit -m "feat(b): API skeleton, Postgres, migrations, shared contracts and stubs"
```

---

### Task B2: Web skeleton

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`, `web/index.html`, `web/public/staticwebapp.config.json`
- Create: `web/src/main.tsx`, `web/src/app/App.tsx`, `web/src/app/features.ts`, `web/src/app/api.ts`, `web/src/app/format.ts`, `web/src/app/ui.tsx`, `web/src/app/styles.css`, `web/src/app/test-utils.tsx`, `web/src/features/health/index.tsx`
- Test: `web/src/app/app.test.tsx`

**Interfaces:**
- Produces: `Feature { path, label, order, element }` — each `web/src/features/<name>/index.tsx` exports `feature` and appears in the nav automatically. Orders: overview 10, intake 20, warehouses 30, carriers 40, replay 50, health 90.
- Produces: `getJSON<T>(path)`, `postJSON<T>(path, body)` (sends `x-api-key` from `VITE_API_KEY`); `pct`, `int`, `usd`, `usd2`; `useApi<T>(path) → { data, error, loading, reload }`; `Section`, `Kpi`, `SyntheticBadge`, `Status`, `Table<T>` with `Column<T>`; test helpers `mockApi(routes)`, `renderScreen(node)`.

- [ ] **Step 1: Install.**

```bash
mkdir -p web && cd web && npm init -y >/dev/null
npm install react react-dom react-router-dom recharts
npm install -D vite @vitejs/plugin-react typescript @types/react @types/react-dom vitest jsdom @testing-library/react @testing-library/dom
cd ..
```

Set `web/package.json` scripts to:

```json
{
  "name": "@latelens/web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit -p tsconfig.json && vite build",
    "test": "vitest run",
    "lint": "tsc --noEmit -p tsconfig.json"
  }
}
```

- [ ] **Step 2: Write the failing test** `web/src/app/app.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { features } from './features';
import { int, pct, usd } from './format';

describe('platform', () => {
  it('formats numbers', () => {
    expect(pct(0.71)).toBe('71.0%');
    expect(usd(872460)).toBe('$872,460');
    expect(int(14019)).toBe('14,019');
  });

  it('discovers feature screens from web/src/features', () => {
    expect(features.map((f) => f.path)).toContain('/health');
  });
});
```

- [ ] **Step 3: Run it to make sure it fails.** Run: `npm test -w web` — Expected: FAIL, `Failed to resolve import "./features"`.

- [ ] **Step 4: Config and entry files.**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  envDir: '..',
  server: { port: 5173 },
  test: { environment: 'jsdom', exclude: ['e2e/**', 'node_modules/**'] },
});
```

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>LateLens</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```json
{ "navigationFallback": { "rewrite": "/index.html" } }
```

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './app/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 5: App shell and shared UI.** `web/src/app/features.ts`, `App.tsx`, `api.ts`, `format.ts`, `ui.tsx`, `styles.css`, `test-utils.tsx`:

```ts
import type { ReactNode } from 'react';

/** Each web/src/features/<name>/index.tsx exports `feature`; screens appear in the nav automatically. */
export interface Feature {
  path: string;
  label: string;
  order: number;
  element: ReactNode;
}

const mods = import.meta.glob<{ feature: Feature }>('../features/*/index.tsx', { eager: true });

export const features: Feature[] = Object.values(mods).map((m) => m.feature).sort((a, b) => a.order - b.order);
```

```tsx
import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { features } from './features';

export function App() {
  const first = features[0]?.path ?? '/';
  return (
    <BrowserRouter>
      <header className="top">
        <span className="brand">LateLens</span>
        <nav>
          {features.map((f) => (
            <NavLink key={f.path} to={f.path}>{f.label}</NavLink>
          ))}
        </nav>
      </header>
      <main>
        <Routes>
          {features.map((f) => <Route key={f.path} path={f.path} element={f.element} />)}
          <Route path="*" element={<Navigate to={first} replace />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
```

```ts
const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const KEY = import.meta.env.VITE_API_KEY ?? '';

export async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return (await res.json()) as T;
}

export async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': KEY },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `${res.status} ${path}`);
  return data;
}
```

```ts
export const pct = (x: number | null | undefined, digits = 1) => (x == null ? '—' : `${(x * 100).toFixed(digits)}%`);
export const int = (x: number | null | undefined) => (x == null ? '—' : Math.round(x).toLocaleString('en-US'));
export const usd = (x: number | null | undefined) =>
  x == null ? '—' : x.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
export const usd2 = (x: number) => x.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
```

```tsx
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { getJSON } from './api';

export function useApi<T>(path: string | null): { data?: T; error?: string; loading: boolean; reload: () => void } {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    getJSON<T>(path)
      .then((data) => live && setState({ data, loading: false }))
      .catch((e: Error) => live && setState({ error: e.message, loading: false }));
    return () => {
      live = false;
    };
  }, [path, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

export function Section({ title, children, badge }: { title: string; children: ReactNode; badge?: ReactNode }) {
  return (
    <section className="card">
      <h2>{title} {badge}</h2>
      {children}
    </section>
  );
}

export function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="kpi">
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
      {note && <div className="kpi-note">{note}</div>}
    </div>
  );
}

export function SyntheticBadge() {
  return <span className="badge synthetic" title="Built on data we generated (SPEC §12.1)">Synthetic data</span>;
}

export function Status({ loading, error }: { loading: boolean; error?: string }) {
  if (error) return <p className="error">Could not load: {error}</p>;
  if (loading) return <p className="muted">Loading…</p>;
  return null;
}

export interface Column<T> { key: string; label: string; render: (row: T) => ReactNode; align?: 'right' }

export function Table<T>({ rows, columns }: { rows: T[]; columns: Column<T>[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map((c) => <th key={c.key} className={c.align}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{columns.map((c) => <td key={c.key} className={c.align}>{c.render(r)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

```css
:root {
  --bg: #f7f7f5; --surface: #ffffff; --text: #1d1d1b; --muted: #6b6b66; --line: #e3e3de;
  --accent: #2f5bd3; --good: #1f7a4d; --bad: #b3261e; --warn: #9a6400; --synthetic: #6d3fc0;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; color: var(--text); background: var(--bg);
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #161615; --surface: #1f1f1d; --text: #ecece8; --muted: #a3a39c; --line: #34342f;
    --accent: #7ea0ff; --good: #5cc28f; --bad: #ff7a70; --warn: #e0a93b; --synthetic: #b89bff; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); }
.top { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; padding: 12px 16px; background: var(--surface); border-bottom: 1px solid var(--line); }
.brand { font-weight: 700; }
nav { display: flex; flex-wrap: wrap; gap: 4px 12px; }
nav a { color: var(--muted); text-decoration: none; }
nav a.active { color: var(--accent); font-weight: 600; }
main { padding: 16px; max-width: 1200px; margin: 0 auto; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 16px; margin-bottom: 16px; }
.card h2 { margin: 0 0 12px; font-size: 1.05rem; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.kpi-value { font-size: 1.6rem; font-weight: 700; }
.kpi-label, .kpi-note, .muted { color: var(--muted); font-size: 0.85rem; }
.table-wrap { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
.right { text-align: right; }
.badge { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 0.75rem; border: 1px solid currentColor; }
.badge.synthetic { color: var(--synthetic); }
.badge.priority { color: var(--bad); }
.status-recommended { color: var(--good); font-weight: 600; }
.status-backup { color: var(--accent); }
.status-blocked { color: var(--bad); }
.error { color: var(--bad); }
.row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 12px; }
button, select, input, textarea { font: inherit; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--line); background: var(--surface); color: var(--text); }
button { cursor: pointer; }
button.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
textarea { width: 100%; min-height: 160px; }
pre { white-space: pre-wrap; font-size: 0.85rem; }
.grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
```

```tsx
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

/** Mock fetch with a map of path -> JSON body. Unknown paths return 404. */
export function mockApi(routes: Record<string, unknown>) {
  const fn = vi.fn(async (url: string) => {
    const path = new URL(url).pathname + new URL(url).search;
    const hit = Object.entries(routes).find(([p]) => path === p || path.startsWith(`${p}?`) || path === p.split('?')[0]);
    const body = hit ? hit[1] : { error: 'not found' };
    return { ok: Boolean(hit), status: hit ? 200 : 404, json: async () => body } as Response;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

export function renderScreen(node: ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}
```

`web/src/features/health/index.tsx` (the first screen; proves autoload and the API connection):

```tsx
import type { Feature } from '../../app/features';
import { Section, Status, useApi } from '../../app/ui';

function Health() {
  const { data, loading, error } = useApi<{ db: string; llm: string; version: string }>('/api/health');
  return (
    <Section title="System health">
      <Status loading={loading} error={error} />
      {data && <p>Database: {data.db} · AI model: {data.llm} · Version: {data.version}</p>}
    </Section>
  );
}

export const feature: Feature = { path: '/health', label: 'Health', order: 90, element: <Health /> };
```

- [ ] **Step 6: Run.** `npm test -w web && npm run build -w web` — Expected: PASS (2 tests), build succeeds. `npm run dev` and open `http://localhost:5173/health` — Expected: "Database: ok".

- [ ] **Step 7: Commit.** `git add web package-lock.json && git commit -m "feat(b): web skeleton with feature autoload and shared UI"`

---

### Task B3: Analytics skeleton (move `prep.py`, loader, writer, pipeline)

**Files:**
- Create: `requirements.txt`, `pytest.ini`, `ruff.toml`
- Create: `analytics/__init__.py`, `analytics/core/__init__.py`, `analytics/core/load.py`, `analytics/core/context.py`, `analytics/core/db.py`, `analytics/core/build.py` (stub), `analytics/pipeline.py`
- Create (stubs, replaced by owners): `analytics/warehouse/__init__.py`, `analytics/carriers/__init__.py`, `analytics/intake/__init__.py`
- Delete: `analysis/prep.py` (replaced by `analytics/core/load.py`)
- Modify: `CLAUDE.md` and `docs/SPEC.md` §5.1 — replace `analysis/prep.py` with `analytics/core/load.py`
- Test: `analytics/tests/conftest.py`, `analytics/tests/test_load.py`, `analytics/tests/test_pipeline.py`

**Interfaces:**
- Produces: `load() -> (d, clients)` where `d` has every supplied column, the client columns, and flags `late, after_cutoff, route_dev, f_addr, f_cutoff, f_stock, f_stock_out, f_skip_nearest, f_bad_lane, f_d_friday, f_lane, f_route, f_addr_email, f_addr_other, f_cut_early, f_cut_late, fair`; constants `FLAGS` (the five causes), `AREA_FLAGS`, `PICK_FLAGS`, `BAD_LANES`, `ROUTE_OVERRUN = 1.20`, `DATA_DIR`, `DATE_COLS`.
- Produces: `Ctx(d, clients, data_dir, tables)` with `ctx.csv(name)`; each area exposes `build(ctx) -> dict[str, DataFrame]`; `write_tables(tables, url)`; `python -m analytics.pipeline [--test-db | --dry-run]`.
- Produces pytest fixtures: `data`, `d`, `clients`, `penalties`.

- [ ] **Step 1: Python environment.**

```text
pandas>=2.2
numpy>=1.26
sqlalchemy>=2.0
psycopg[binary]>=3.2
python-dotenv>=1.0
pytest>=8.0
ruff>=0.6
```

```ini
[pytest]
pythonpath = .
testpaths = analytics/tests
```

```toml
line-length = 135
target-version = "py312"

[lint]
select = ["E", "F", "I"]
```

```bash
python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
mkdir -p analytics/core analytics/tests analytics/warehouse analytics/carriers analytics/intake
touch analytics/__init__.py analytics/core/__init__.py
```

- [ ] **Step 2: Write the failing tests.** `analytics/tests/conftest.py`, `test_load.py` (AC-DIAG-01), `test_pipeline.py`:

```python
import pytest

from analytics.core.load import DATA_DIR, load


@pytest.fixture(scope="session")
def data():
    return load()


@pytest.fixture(scope="session")
def d(data):
    return data[0]


@pytest.fixture(scope="session")
def clients(data):
    return data[1]


@pytest.fixture(scope="session")
def penalties():
    import pandas as pd
    return pd.read_csv(DATA_DIR / "sla_penalties.csv")
```

```python
def test_ac_diag_01_flag_counts(d):
    expected = {"f_addr": 5994, "f_cutoff": 4826, "f_stock": 6700, "f_stock_out": 6009, "f_skip_nearest": 691,
                "f_lane": 10030, "f_bad_lane": 7895, "f_d_friday": 4333, "f_route": 2880, "fair": 32045}
    assert len(d) == 48340
    assert {k: int(d[k].sum()) for k in expected} == expected


def test_ac_diag_01_five_causes_explain_every_late_delivery(d):
    from analytics.core.load import FLAGS
    assert d[~d[FLAGS].any(axis=1)].late.sum() == 0
```

```python
from analytics.pipeline import run


def test_pipeline_runs_and_returns_tables():
    tables = run()
    assert "clients" in tables and len(tables["clients"]) == 280
```

- [ ] **Step 3: Run to see it fail.** `python -m pytest` — Expected: FAIL, `ModuleNotFoundError: analytics.core.load`.

- [ ] **Step 4: Loader** (the old `analysis/prep.py`, with the spec's flag names and the split flags). `analytics/core/load.py`:

```python
"""Load the supplied dataset and add the cause flags defined in SPEC §5.1."""
from pathlib import Path

import pandas as pd

REPO = Path(__file__).resolve().parents[2]
DATA_DIR = REPO / "Halcyon-Hackathon-Dataset"
DATE_COLS = ["order_received_ts", "shipped_ts", "promised_date", "pick_list_date", "delivered_date"]

# The five root causes (SPEC §5.1). Together they explain every late delivery in the data.
FLAGS = ["f_addr", "f_stock", "f_cutoff", "f_lane", "f_route"]
# Split flag sets used by the area / "as built" scenarios (SPEC §2.4).
AREA_FLAGS = ["f_addr_email", "f_addr_other", "f_cutoff", "f_skip_nearest", "f_stock_out", "f_lane", "f_route"]
PICK_FLAGS = ["f_addr_email", "f_addr_other", "f_cut_early", "f_cut_late", "f_skip_nearest", "f_stock_out", "f_lane", "f_route"]
CUTOFF_HOUR = 8
ROUTE_OVERRUN = 1.20   # no otherwise-clean delivery is late below a 20% overrun
FRIDAY = 4
# Carrier x region lanes that fail on fair data every day of the week (reproduced by analytics/carriers/lanes.py).
BAD_LANES = {("D", "Midwest"), ("D", "Southeast"), ("E", "West"), ("F", "Northeast"), ("F", "Southeast")}


def add_flags(d: pd.DataFrame) -> pd.DataFrame:
    d = d.copy()
    hour = d.order_received_ts.dt.hour
    d["late"] = d.on_time.eq("N")
    d["after_cutoff"] = hour >= CUTOFF_HOUR
    d["route_dev"] = d.actual_route_km / d.planned_route_km
    d["f_addr"] = d.address_status.eq("incomplete")
    d["f_cutoff"] = d.commitment_type.eq("same_day") & d.after_cutoff
    d["f_stock"] = d.fulfilment_warehouse_id.ne(d.nearest_warehouse_id)
    d["f_stock_out"] = d.f_stock & d.nearest_warehouse_had_stock.eq("N")
    d["f_skip_nearest"] = d.f_stock & d.nearest_warehouse_had_stock.eq("Y")
    lane = pd.Series(list(zip(d.carrier_id, d.destination_region)), index=d.index)
    d["f_bad_lane"] = lane.isin(BAD_LANES)
    d["f_d_friday"] = d.carrier_id.eq("D") & d.order_received_ts.dt.day_of_week.eq(FRIDAY)
    d["f_lane"] = d.f_bad_lane | d.f_d_friday
    d["f_route"] = d.route_dev.gt(ROUTE_OVERRUN)  # NaN (missing actual km) -> False
    d["f_addr_email"] = d.f_addr & d.order_channel.eq("Email")
    d["f_addr_other"] = d.f_addr & d.order_channel.ne("Email")
    d["f_cut_early"] = d.f_cutoff & (hour < 11)
    d["f_cut_late"] = d.f_cutoff & (hour >= 11)
    d["fair"] = ~(d.f_addr | d.f_stock | d.f_cutoff)
    return d


def load(data_dir: Path = DATA_DIR) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Return (deliveries with flags and client columns, clients)."""
    d = pd.read_csv(data_dir / "deliveries.csv")
    for col in DATE_COLS:
        d[col] = pd.to_datetime(d[col])
    clients = pd.read_csv(data_dir / "clients.csv")
    d = add_flags(d).merge(clients, on="client_id", how="left")
    return d, clients
```

Then `git rm analysis/prep.py` and update the two references in `CLAUDE.md` and SPEC §5.1.

- [ ] **Step 5: Context, writer, pipeline, stubs.** `analytics/core/context.py`, `analytics/core/db.py`, `analytics/pipeline.py`:

```python
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd


@dataclass
class Ctx:
    d: pd.DataFrame
    clients: pd.DataFrame
    data_dir: Path
    tables: dict[str, pd.DataFrame] = field(default_factory=dict)

    def csv(self, name: str) -> pd.DataFrame:
        return pd.read_csv(self.data_dir / name)
```

```python
"""Write pipeline tables to Postgres. Each run replaces every table in one transaction."""
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine

REPO = Path(__file__).resolve().parents[2]
load_dotenv(REPO / ".env")


def sqlalchemy_url(url: str) -> str:
    for prefix in ("postgresql://", "postgres://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


def write_tables(tables: dict[str, pd.DataFrame], url: str) -> None:
    engine = create_engine(sqlalchemy_url(url))
    with engine.begin() as conn:
        for name, df in tables.items():
            df.to_sql(name, conn, if_exists="replace", index=False, method="multi", chunksize=1000)
    engine.dispose()
```

```python
"""Run every area's build step and write the tables (CONTRACTS §4).

Usage:  python -m analytics.pipeline            # writes to DATABASE_URL
        python -m analytics.pipeline --test-db  # writes to TEST_DATABASE_URL
        python -m analytics.pipeline --dry-run  # builds only, prints table sizes
"""
import argparse
import os
import time

import pandas as pd

from analytics import carriers, intake, warehouse
from analytics.core.build import build as core_build
from analytics.core.context import Ctx
from analytics.core.db import write_tables
from analytics.core.load import DATA_DIR, load

STEPS = [("core", core_build), ("warehouse", warehouse.build), ("carriers", carriers.build), ("intake", intake.build)]


def run() -> dict[str, pd.DataFrame]:
    d, clients = load()
    ctx = Ctx(d=d, clients=clients, data_dir=DATA_DIR)
    for name, step in STEPS:
        started = time.time()
        out = step(ctx)
        overlap = set(out) & set(ctx.tables)
        if overlap:
            raise ValueError(f"step {name} rewrote tables owned by an earlier step: {overlap}")
        ctx.tables.update(out)
        print(f"{name}: {len(out)} tables in {time.time() - started:.1f}s")
    return ctx.tables


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--test-db", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    tables = run()
    if args.dry_run:
        for name, df in sorted(tables.items()):
            print(f"{name:28s} {len(df):>8,} rows")
        return
    url = os.environ["TEST_DATABASE_URL" if args.test_db else "DATABASE_URL"]
    started = time.time()
    write_tables(tables, url)
    print(f"wrote {len(tables)} tables in {time.time() - started:.1f}s")


if __name__ == "__main__":
    main()
```

`analytics/core/build.py` (stub until B5):

```python
"""Core pipeline step (owner B). Filled in Tasks B5 and B6."""
import pandas as pd

from analytics.core.context import Ctx


def build(ctx: Ctx) -> dict[str, pd.DataFrame]:
    return {"clients": ctx.clients}
```

`analytics/warehouse/__init__.py`, `analytics/carriers/__init__.py`, `analytics/intake/__init__.py` (same stub in each; A, B and C replace their own):

```python
"""<Area> pipeline step. Replaced by the owning resource's plan."""
import pandas as pd

from analytics.core.context import Ctx


def build(ctx: Ctx) -> dict[str, pd.DataFrame]:
    return {}
```

- [ ] **Step 6: Run.** `python -m pytest && ruff check analytics && python -m analytics.pipeline --dry-run`
Expected: 3 passed (flag counts, "five causes explain every late delivery", pipeline); ruff clean; dry run prints `clients 280 rows`. Then `python -m analytics.pipeline --test-db` — Expected: `wrote 1 tables`.

- [ ] **Step 7: Commit.** `git add requirements.txt pytest.ini ruff.toml analytics CLAUDE.md docs/SPEC.md && git rm -q analysis/prep.py; git commit -m "feat(b): analytics package, loader with spec flags, pipeline runner"`

---

### Task B4: CI and run instructions

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `README.md` (append the run section)

- [ ] **Step 1: Workflow** `.github/workflows/ci.yml` (one job with a Postgres service runs Python tests, regenerates synthetic data and checks it is byte-identical — AC-NFR-05 — fills the test database, runs every Node test, and builds; a second job runs the secret scan — AC-SEC-01):

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: latelens
          POSTGRES_PASSWORD: latelens
          POSTGRES_DB: latelens_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U latelens"
          --health-interval 5s --health-timeout 5s --health-retries 10
    env:
      DATABASE_URL: postgres://latelens:latelens@localhost:5432/latelens_test
      TEST_DATABASE_URL: postgres://latelens:latelens@localhost:5432/latelens_test
      API_KEY: test-key
      LLM_PROVIDER: recorded
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: pip
      - run: pip install -r requirements.txt
      - run: ruff check analytics synthetic-data/generators
      - run: python -m pytest
      - name: Generate synthetic data (and check it is reproducible)
        run: |
          shopt -s nullglob
          for g in synthetic-data/generators/*.py; do python "$g"; done
          files=(synthetic-data/out/*.csv synthetic-data/out/*.json)
          if [ ${#files[@]} -gt 0 ]; then
            sha1sum "${files[@]}" > /tmp/first
            for g in synthetic-data/generators/*.py; do python "$g" > /dev/null; done
            sha1sum -c /tmp/first
          fi
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: python -m analytics.pipeline --test-db
      - run: npm run migrate:test -w api
      - run: npm run seed -w api -- --test
      - run: npm test
      - run: npm run build -w api
      - run: npm run build -w web

  secrets:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

While no generators exist yet the synthetic-data step does nothing (`nullglob`); it starts checking reproducibility as soon as A, B or C add one.

- [ ] **Step 2: README.** Append to `README.md`:

````markdown
## Run LateLens locally

Prerequisites: Docker Desktop, Node 22+, Python 3.12+.

```bash
cp .env.example .env
docker compose up -d                      # Postgres with databases latelens and latelens_test
python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
for g in synthetic-data/generators/*.py; do python "$g"; done
python -m analytics.pipeline              # computed tables -> latelens
python -m analytics.pipeline --test-db    # computed tables -> latelens_test
npm install
npm run migrate -w api && npm run migrate:test -w api
npm run seed -w api && npm run seed -w api -- --test
npm run dev                               # API on :3001, web on :5173
```

Tests: `python -m pytest` · `npm test` (route tests run only when the test database is up).
Docs: `docs/SPEC.md` (what and why), `docs/CONTRACTS.md` (shared types, tables, API), `docs/superpowers/plans/` (task plans).
````

- [ ] **Step 3: Verify on GitHub.** Push a branch, open a PR. Expected: `ci / test` and `ci / secrets` both green. Ask the repo owner (`saiprasad-37`) to require `ci / test` on `main` (Settings → Branches).

- [ ] **Step 4: Commit.** `git add .github README.md && git commit -m "ci(b): tests, synthetic-data reproducibility, secret scan"`

**Monday check-in:** B1–B4 merged; everyone has run the README steps on their laptop.

---

### Task B5: Diagnostic engine (D1, D2) — cause flags, stages, data quality, KPIs, accounts

**Files:**
- Create: `analytics/core/diagnosis.py`
- Modify: `analytics/core/build.py`
- Test: `analytics/tests/test_diagnosis.py`

**Interfaces:**
- Consumes: `load()`, `FLAGS` (B3).
- Produces tables (CONTRACTS §4): `deliveries_clean`, `clients`, `carriers`, `warehouses`, `delivery_causes`, `dq_report`, `kpis`, `cause_summary`, `accounts`.
- Produces: `diagnosis.segments(d)`, `diagnosis.unpaid_penalties(d, penalties)`, `diagnosis.cause_kpis(d, complaints)` (SPEC §1.4 baselines; written as table `cause_kpis` from B6), `LABELS`, `STAGE`, `HANDLING_COST = 34`, `PENALTY = 180`; `ctx.d` gains `dq_bad_dates`, `dq_dup_order_id`.

- [ ] **Step 1: Write the failing test** `analytics/tests/test_diagnosis.py` (AC-DIAG-02, -03, -05, KPI and account checks):

```python
import pytest

from analytics.core import diagnosis
from analytics.core.diagnosis import add_dq


@pytest.fixture(scope="module")
def dq(d):
    return add_dq(d)


def test_ac_diag_02_flags_without_dropping(dq):
    assert len(dq) == 48340
    assert int(dq.dq_bad_dates.sum()) == 450
    assert int(dq.dq_dup_order_id.sum()) == 42
    assert dq.loc[dq.dq_dup_order_id, "order_id"].nunique() == 21


def test_ac_diag_03_report(dq, penalties):
    report = dict(diagnosis.dq_report(dq, penalties).values)
    assert report == {"delivered_before_shipped": 450, "order_id_reused_across_clients": 21,
                      "missing_actual_route_km": 1339, "late_with_clause_but_no_penalty": 2002}


def test_ac_diag_05_stages(dq):
    causes = diagnosis.delivery_causes(dq).set_index("delivery_id")
    row = causes.loc["D000002"]
    assert bool(row.late) and "Fulfilment" in row.stages.split(",")


def test_kpis(dq, clients, penalties):
    k = dict(diagnosis.kpis(dq, clients, penalties).values)
    assert k["on_time"] == pytest.approx(0.710, abs=0.0005)
    assert k["late"] == 14019 and k["penalties_usd"] == 872460 and k["handling_cost_usd"] == 476646
    assert k["at_risk_accounts"] == 9 and k["at_risk_revenue_usd"] == 14_200_000
    assert k["pre_pickup_share"] == pytest.approx(0.673, abs=0.0005)


def test_cause_summary_all_segment(dq):
    s = diagnosis.cause_summary(dq)
    s = s[s.segment.eq("all")].set_index("flag")
    assert int(s.loc["f_addr", "n"]) == 5994 and s.loc["f_addr", "late_rate"] == pytest.approx(0.646, abs=0.001)
    assert s.loc["none", "late_rate"] == 0.0


def test_cause_kpis(dq):
    import pandas as pd

    from analytics.core.load import DATA_DIR
    k = diagnosis.cause_kpis(dq, pd.read_csv(DATA_DIR / "complaints.csv")).set_index("kpi").baseline
    assert k["Orders with an incomplete address at the pick list"] == pytest.approx(0.124, abs=0.001)
    assert k["Shipments on a bad lane or on carrier D on a Friday"] == pytest.approx(0.207, abs=0.001)
    assert k["'Not told about the delay' complaints per quarter"] == 12


def test_accounts(dq, clients):
    import pandas as pd

    from analytics.core.load import DATA_DIR
    a = diagnosis.accounts(dq, clients, pd.read_csv(DATA_DIR / "complaints.csv"))
    assert len(a) == 9 and int(a.annual_revenue_usd.sum()) == 14_200_000 and int(a.complaints.sum()) == 24
```

- [ ] **Step 2: Run it.** `python -m pytest analytics/tests/test_diagnosis.py` — Expected: FAIL, `ImportError: cannot import name 'diagnosis'`.

- [ ] **Step 3: Implement** `analytics/core/diagnosis.py`:

```python
"""Data quality, stages and summary tables (SPEC §5.1, D1-D3, D6)."""
import pandas as pd

from analytics.core.load import FLAGS

LABELS = {
    "f_addr": "Incomplete address at intake",
    "f_cutoff": "Same-day order after 8am cut-off",
    "f_stock": "Shipped from a non-nearest warehouse",
    "f_stock_out": "Nearest warehouse out of stock",
    "f_skip_nearest": "Nearest warehouse skipped despite stock",
    "f_lane": "Bad carrier lane or D on a Friday",
    "f_bad_lane": "Bad carrier lane",
    "f_d_friday": "Carrier D on a Friday",
    "f_route": "Route >20% over plan",
    "none": "None of the five",
}
STAGE = {"f_addr": "Intake", "f_cutoff": "Promise", "f_stock": "Fulfilment", "f_stock_out": "Fulfilment",
         "f_skip_nearest": "Fulfilment", "f_lane": "Carrier", "f_bad_lane": "Carrier", "f_d_friday": "Carrier",
         "f_route": "Delivery", "none": "-"}
STAGE_FLAGS = [("Intake", ["f_addr"]), ("Promise", ["f_cutoff"]), ("Fulfilment", ["f_stock"]),
               ("Carrier", ["f_lane"]), ("Delivery", ["f_route"])]
SUMMARY_FLAGS = ["f_addr", "f_cutoff", "f_stock", "f_stock_out", "f_skip_nearest", "f_lane", "f_bad_lane",
                 "f_d_friday", "f_route"]
HANDLING_COST = 34
PENALTY = 180


def segments(d: pd.DataFrame) -> dict[str, pd.Series]:
    return {
        "all": pd.Series(True, index=d.index),
        "email": d.order_channel.eq("Email"),
        "at_risk": d.account_status.eq("threatening_to_leave"),
        "aug_sep": d.order_received_ts.dt.month.ge(8),
    }


def add_dq(d: pd.DataFrame) -> pd.DataFrame:
    d = d.copy()
    d["dq_bad_dates"] = d.delivered_date < d.shipped_ts.dt.normalize()
    clients_per_order = d.groupby("order_id").client_id.nunique()
    d["dq_dup_order_id"] = d.order_id.isin(clients_per_order[clients_per_order > 1].index)
    return d


def stages(d: pd.DataFrame) -> pd.Series:
    cols = [d[flags].any(axis=1).map({True: stage, False: ""}) for stage, flags in STAGE_FLAGS]
    return pd.concat(cols, axis=1).apply(lambda row: ",".join(s for s in row if s), axis=1)


def unpaid_penalties(d: pd.DataFrame, penalties: pd.DataFrame) -> pd.DataFrame:
    eligible = d.late & d.sla_penalty_clause.eq("Y")
    return d[eligible & ~d.delivery_id.isin(penalties.delivery_id)]


def dq_report(d: pd.DataFrame, penalties: pd.DataFrame) -> pd.DataFrame:
    rows = [
        ("delivered_before_shipped", int(d.dq_bad_dates.sum())),
        ("order_id_reused_across_clients", int(d.loc[d.dq_dup_order_id, "order_id"].nunique())),
        ("missing_actual_route_km", int(d.actual_route_km.isna().sum())),
        ("late_with_clause_but_no_penalty", len(unpaid_penalties(d, penalties))),
    ]
    return pd.DataFrame(rows, columns=["issue", "count"])


def kpis(d: pd.DataFrame, clients: pd.DataFrame, penalties: pd.DataFrame) -> pd.DataFrame:
    at_risk = clients[clients.account_status.eq("threatening_to_leave")]
    late = d[d.late]
    rows = {
        "on_time": 1 - d.late.mean(),
        "benchmark": 0.94,
        "deliveries": len(d),
        "late": len(late),
        "penalties_usd": penalties.penalty_usd.sum(),
        "handling_cost_usd": d.redelivery_cost_usd.sum(),
        "at_risk_accounts": len(at_risk),
        "at_risk_revenue_usd": at_risk.annual_revenue_usd.sum(),
        "pre_pickup_share": (late.f_addr | late.f_stock | late.f_cutoff).mean(),
    }
    return pd.DataFrame({"key": list(rows), "value": [float(v) for v in rows.values()]})


def cause_summary(d: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for seg, mask in segments(d).items():
        if seg == "aug_sep":
            continue
        s = d[mask]
        for flag in SUMMARY_FLAGS:
            hit = s[s[flag]]
            rows.append((seg, flag, LABELS[flag], STAGE[flag], len(hit), hit.late.mean() if len(hit) else 0.0))
        none = s[~s[FLAGS].any(axis=1)]
        rows.append((seg, "none", LABELS["none"], STAGE["none"], len(none), none.late.mean() if len(none) else 0.0))
    return pd.DataFrame(rows, columns=["segment", "flag", "label", "stage", "n", "late_rate"])


def accounts(d: pd.DataFrame, clients: pd.DataFrame, complaints: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for _, c in clients[clients.account_status.eq("threatening_to_leave")].iterrows():
        s = d[d.client_id.eq(c.client_id)]
        late = s[s.late]
        counts = {f: int(late[f].sum()) for f in FLAGS}
        main = max(counts, key=counts.get) if len(late) else "none"
        rows.append({
            "client_id": c.client_id, "client_name": c.client_name, "account_tier": c.account_tier,
            "annual_revenue_usd": int(c.annual_revenue_usd), "primary_order_channel": c.primary_order_channel,
            "deliveries": len(s), "on_time": 1 - s.late.mean(), "main_cause": LABELS[main],
            "complaints": int(complaints.client_id.eq(c.client_id).sum()),
        })
    return pd.DataFrame(rows).sort_values("annual_revenue_usd", ascending=False).reset_index(drop=True)


def delivery_causes(d: pd.DataFrame) -> pd.DataFrame:
    cols = ["delivery_id", "client_id", "order_channel", "commitment_type", "destination_region", "carrier_id",
            "late", "f_addr", "f_cutoff", "f_stock", "f_stock_out", "f_skip_nearest", "f_lane", "f_bad_lane",
            "f_d_friday", "f_route", "fair"]
    out = d[cols].copy()
    out["stages"] = stages(d)
    return out


def cause_kpis(d: pd.DataFrame, complaints: pd.DataFrame) -> pd.DataFrame:
    """One measurable KPI per cause, with today's baseline from the data and the target (SPEC §1.4)."""
    route_known = d.actual_route_km.notna()
    rows = [
        ("f_addr", "Incomplete address", "Orders with an incomplete address at the pick list",
         d.f_addr.mean(), "<2%", "Customer success"),
        ("f_lane", "Carrier lane / Friday overload", "Shipments on a bad lane or on carrier D on a Friday",
         d.f_lane.mean(), "0%", "Transport planning"),
        ("f_stock", "Wrong warehouse", "Orders where the nearest warehouse is out of stock",
         d.f_stock_out.mean(), "<8%", "Inventory planning"),
        ("f_stock", "Wrong warehouse", "Orders shipped from a far warehouse although the nearest had stock",
         float(d.f_skip_nearest.sum()), "0", "Warehouse supervisors"),
        ("f_cutoff", "Cutoff promise", "Late rate of same-day orders received after 08:00",
         d[d.f_cutoff].late.mean(), "<26% (the before-cutoff rate)", "Sales ops / warehouse"),
        ("f_route", "Route detour", "Routes more than 20% over plan",
         d.loc[route_known, "f_route"].mean(), "<3%", "Carrier management"),
        ("none", "Not told about delay", "'Not told about the delay' complaints per quarter",
         float(complaints.category.eq("Not told about the delay").sum()), "0", "Account owners"),
    ]
    return pd.DataFrame(rows, columns=["cause", "label", "kpi", "baseline", "target", "owner"])
```

and replace `analytics/core/build.py`:

```python
"""Core pipeline step (owner B): diagnosis tables. Replay is added in Task B6."""
import pandas as pd

from analytics.core import diagnosis
from analytics.core.context import Ctx
from analytics.core.load import DATE_COLS


def build(ctx: Ctx) -> dict[str, pd.DataFrame]:
    penalties = ctx.csv("sla_penalties.csv")
    complaints = ctx.csv("complaints.csv")
    d = diagnosis.add_dq(ctx.d)
    ctx.d = d
    raw_cols = list(pd.read_csv(ctx.data_dir / "deliveries.csv", nrows=0).columns)
    clean = d[raw_cols + ["dq_bad_dates", "dq_dup_order_id"]].copy()
    for col in DATE_COLS:
        clean[col] = clean[col].astype("datetime64[us]")
    return {
        "deliveries_clean": clean,
        "clients": ctx.clients,
        "carriers": ctx.csv("carriers.csv"),
        "warehouses": ctx.csv("warehouses.csv"),
        "delivery_causes": diagnosis.delivery_causes(d),
        "dq_report": diagnosis.dq_report(d, penalties),
        "kpis": diagnosis.kpis(d, ctx.clients, penalties),
        "cause_summary": diagnosis.cause_summary(d),
        "accounts": diagnosis.accounts(d, ctx.clients, complaints),
    }
```

- [ ] **Step 4: Run.** `python -m pytest && python -m analytics.pipeline --dry-run` — Expected: all pass; dry run lists `delivery_causes 48,340`, `kpis 9`, `accounts 9`.

- [ ] **Step 5: Commit.** `git add analytics && git commit -m "feat(b): diagnostic engine — causes, stages, data quality, KPIs, accounts"`

---

### Task B6: Replay (D4, W6, D8) — full-fix and expected-adoption scenarios, cause attribution

**Files:**
- Create: `analytics/core/ifixed.py`, `analytics/core/scenarios.py`
- Modify: `analytics/core/build.py` (adds `scenario_results`)
- Test: `analytics/tests/test_scenarios.py`

**Interfaces:**
- Produces: `if_fixed(d, fix, flags) -> Series` (raises if a combination has no baseline), `adopted(d, rates, flags) -> Series` (expected adoption; equals `if_fixed` at rate 1.0), `shapley(d, flags) -> dict` (points of on-time lost per cause), `paid_ratio(d, penalties)`, `cost_avoided(d, est, ratio) -> (late_avoided, usd)`, `SCENARIOS`, `ADOPTION`, `cause_attribution(d)`; tables `scenario_results` (23 scenarios × 4 segments = 92 rows), `cause_attribution` (5 rows), `cause_kpis` (7 rows).

- [ ] **Step 1: Write the failing test** `analytics/tests/test_scenarios.py` (AC-DIAG-04, AC-DIAG-07, AC-REP-01, -02, -04, -05, -06, AC-PRO-05):

```python
import pytest

from analytics.core.scenarios import scenario_results

# SPEC §2.4 golden values for the "all" segment: (on-time %, late avoided, cost avoided USD)
GOLDEN = {
    "today": (71.0, 0, 0),
    "route_only": (73.6, 1279, 113347),
    "carrier_only": (77.4, 3091, 282161),
    "vendor_best": (80.4, 4523, 409897),
    "address_only": (77.1, 2967, 322413),
    "address_lanes": (84.2, 6381, 639700),
    "addr_cut_stock": (87.8, 8112, 801412),
    "all_but_route": (96.3, 12239, 1184850),
    "second_pick": (73.4, 1176, 105117),
    "area_email": (75.3, 2092, 244119),
    "area_warehouse": (76.3, 2554, 232211),
    "area_carriers": (77.4, 3091, 282161),
    "as_built": (88.5, 8447, 832879),
    "as_built_adopted": (85.9, 7191, 707950),
    "as_built_api_edi": (90.6, 9485, 924292),
    "as_built_oos": (94.0, 11136, 1087383),
    "as_built_phase2": (96.3, 12239, 1184850),
    "adopt_address": (76.2, 2522, 274051),
    "adopt_lanes": (82.5, 5551, 554867),
    "adopt_cutoff": (87.3, 7876, 767984),
    "adopt_warehouse": (91.0, 9649, 934781),
    "adopt_all": (92.0, 10150, 980764),
    "adopt_vendor": (78.3, 3521, 320482),
}
SEGMENT_GOLDEN = {
    ("as_built", "email"): 93.3, ("as_built", "at_risk"): 89.7, ("address_only", "email"): 84.4,
    ("vendor_best", "at_risk"): 78.8, ("adopt_all", "email"): 92.6, ("as_built_adopted", "at_risk"): 86.8,
}


@pytest.fixture(scope="module")
def results(d, penalties):
    return scenario_results(d, penalties).set_index(["scenario", "segment"])


@pytest.mark.parametrize("key", GOLDEN)
def test_ac_diag_04_and_ac_rep_01_golden(results, key):
    on_time, late_avoided, usd = GOLDEN[key]
    row = results.loc[(key, "all")]
    assert round(100 * row.on_time, 1) == on_time
    assert row.late_avoided == pytest.approx(late_avoided, abs=1)
    assert row.cost_avoided == pytest.approx(usd, abs=1)


@pytest.mark.parametrize("key,segment", SEGMENT_GOLDEN)
def test_ac_rep_01_segments(results, key, segment):
    assert round(100 * results.loc[(key, segment)].on_time, 1) == SEGMENT_GOLDEN[(key, segment)]


def test_ac_rep_02_as_built_cost(results):
    row = results.loc[("as_built", "all")]
    assert round(row.late_avoided) == 8447 and row.cost_avoided == pytest.approx(832879, abs=1)


def test_ac_pro_05_second_pick(d, results):
    assert int(d.f_cut_early.sum()) == 2414
    assert round(100 * results.loc[("second_pick", "all")].on_time, 1) == 73.4


def test_ac_rep_04_no_synthetic_inputs():
    import analytics.core.scenarios as mod
    assert "synthetic" not in open(mod.__file__).read().replace("supplied dataset only", "")


def test_ac_rep_05_adoption_matches_full_fix_at_100_percent(d):
    from analytics.core.ifixed import adopted, if_fixed
    from analytics.core.load import FLAGS
    fix = ["f_addr", "f_cutoff", "f_stock", "f_lane"]
    assert (adopted(d, {f: 1.0 for f in fix}, FLAGS) - if_fixed(d, fix, FLAGS)).abs().max() < 1e-12


def test_ac_rep_06_programme_waterfall(results):
    steps = ["today", "adopt_address", "adopt_lanes", "adopt_cutoff", "adopt_warehouse", "adopt_all"]
    assert [round(100 * results.loc[(k, "all")].on_time, 1) for k in steps] == [71.0, 76.2, 82.5, 87.3, 91.0, 92.0]
    assert round(100 * results.loc[("adopt_vendor", "all")].on_time, 1) == 78.3


def test_cause_attribution_sums_to_lateness(d):
    from analytics.core.scenarios import cause_attribution
    a = cause_attribution(d).set_index("cause").points_lost
    assert a.sum() == pytest.approx(d.late.mean(), abs=1e-9)
    # Points lost per cause, as in the diagnostic deck (7.6, 7.0, 5.6, 5.6, 3.2)
    pdf = {"f_lane": 7.6, "f_addr": 7.0, "f_stock": 5.6, "f_cutoff": 5.6, "f_route": 3.2}
    assert {f: 100 * a[f] for f in pdf} == pytest.approx(pdf, abs=0.06)
```

- [ ] **Step 2: Run it.** Expected: FAIL, `ModuleNotFoundError: analytics.core.scenarios`.

- [ ] **Step 3: Implement** `analytics/core/ifixed.py` and `analytics/core/scenarios.py`:

```python
"""'If fixed' estimate (SPEC §5.1), adoption-adjusted replay, cause attribution and cost avoided (SPEC §1.1)."""
from itertools import combinations, product
from math import factorial

import pandas as pd

from analytics.core.diagnosis import HANDLING_COST, PENALTY


def if_fixed(d: pd.DataFrame, fix: list[str], flags: list[str]) -> pd.Series:
    """Per-delivery late probability after fixing every flag in `fix`.

    Rows with any fixed flag take the mean late rate of rows that have none of the fixed flags and the same values
    of the remaining flags. Raises if some combination has no baseline.
    """
    est = d.late.astype(float).copy()
    if not fix:
        return est
    rest = [f for f in flags if f not in fix]
    has = d[fix].any(axis=1)
    if not rest:
        est[has] = d.loc[~has, "late"].mean()
        return est
    base = d.loc[~has].groupby(rest).late.mean()
    keys = d.loc[has, rest[0]] if len(rest) == 1 else pd.MultiIndex.from_frame(d.loc[has, rest])
    est[has] = base.reindex(keys).to_numpy()
    if est.isna().any():
        raise ValueError(f"no baseline for some rows when fixing {fix} over {flags}")
    return est


def paid_ratio(d: pd.DataFrame, penalties: pd.DataFrame) -> float:
    eligible = d.late & d.sla_penalty_clause.eq("Y")
    return len(penalties) / int(eligible.sum())


def cost_avoided(d: pd.DataFrame, est: pd.Series, ratio: float) -> tuple[float, float]:
    """Return (late deliveries avoided, USD avoided) over the rows of d."""
    delta = d.late.astype(float) - est
    clause = d.sla_penalty_clause.eq("Y")
    late_avoided = float(delta.sum())
    usd = late_avoided * HANDLING_COST + float((delta * clause).sum()) * PENALTY * ratio
    return late_avoided, usd


def _late_rate(d: pd.DataFrame, flags: list[str], key: tuple, lookup: dict) -> float:
    """Late rate of deliveries with exactly these causes; if none exist, of deliveries with at least these causes
    (a conservative stand-in used only for rare combinations)."""
    if key in lookup:
        return lookup[key]
    has = [f for f, v in zip(flags, key) if v]
    mask = d[has].all(axis=1) if has else pd.Series(True, index=d.index)
    rate = float(d.loc[mask, "late"].mean())
    lookup[key] = rate
    return rate


def adopted(d: pd.DataFrame, rates: dict[str, float], flags: list[str]) -> pd.Series:
    """Per-delivery late probability when each fix in `rates` works on that share of its deliveries.

    A fix with rate 0.85 removes its cause from 85% of the deliveries that have it. A delivery keeps its actual
    outcome when none of its causes is removed; otherwise it takes the late rate of deliveries with exactly the
    causes that remain. With every rate at 1.0 this equals if_fixed().
    """
    lookup = {k if isinstance(k, tuple) else (k,): v for k, v in d.groupby(flags).late.mean().items()}
    keep, moved = {}, {}
    for combo in d[flags].drop_duplicates().itertuples(index=False):
        present = [i for i, f in enumerate(flags) if combo[i] and f in rates]
        p_keep, value = 1.0, 0.0
        for mask in product([False, True], repeat=len(present)):
            p, key = 1.0, list(combo)
            for i, fixed in zip(present, mask):
                p *= rates[flags[i]] if fixed else 1 - rates[flags[i]]
                if fixed:
                    key[i] = False
            if not any(mask):
                p_keep = p
            elif p > 0:
                value += p * _late_rate(d, flags, tuple(key), lookup)
        keep[tuple(combo)], moved[tuple(combo)] = p_keep, value
    keys = pd.MultiIndex.from_frame(d[flags])
    p_keep = pd.Series(keep).reindex(keys).to_numpy()
    value = pd.Series(moved).reindex(keys).to_numpy()
    return pd.Series(p_keep * d.late.astype(float).to_numpy() + value, index=d.index)


def shapley(d: pd.DataFrame, flags: list[str]) -> dict[str, float]:
    """Points of on-time delivery lost to each cause, sharing deliveries with several causes fairly (SPEC §2.2)."""
    n = len(flags)
    on_time = {}
    for size in range(n + 1):
        for subset in combinations(flags, size):
            on_time[frozenset(subset)] = 1 - float(if_fixed(d, list(subset), flags).mean())
    out = {}
    for f in flags:
        others = [g for g in flags if g != f]
        total = 0.0
        for size in range(n):
            for subset in combinations(others, size):
                s = frozenset(subset)
                weight = factorial(size) * factorial(n - size - 1) / factorial(n)
                total += weight * (on_time[s | {f}] - on_time[s])
        out[f] = total
    return out
```

```python
"""Replay scenarios (SPEC §2.4, §5.8). Uses the supplied dataset only (REQ-REP-04)."""
from dataclasses import dataclass, field

import pandas as pd

from analytics.core.diagnosis import segments
from analytics.core.ifixed import adopted, cost_avoided, if_fixed, paid_ratio, shapley
from analytics.core.load import AREA_FLAGS, FLAGS, PICK_FLAGS

# Share of each cause a fix removes in practice (SPEC §2.4, from the diagnostic deck). Full-fix scenarios use 1.0.
ADOPTION = {"f_addr": 0.85, "f_lane": 0.90, "f_cutoff": 0.85, "f_stock": 0.60, "f_route": 0.30}
AS_BUILT = ["f_addr_email", "f_cutoff", "f_skip_nearest", "f_lane"]
AS_BUILT_ADOPTION = {"f_addr_email": 0.85, "f_cutoff": 0.85, "f_skip_nearest": 0.60, "f_lane": 0.90}


@dataclass(frozen=True)
class Scenario:
    key: str
    label: str
    grp: str
    flags: list[str]
    fix: list[str] = field(default_factory=list)
    rates: dict[str, float] = field(default_factory=dict)   # set -> adoption-adjusted


def _waterfall() -> list[Scenario]:
    steps = [("adopt_address", "+ address check (85%)", "f_addr"),
             ("adopt_lanes", "+ lane rules and Friday cap (90%)", "f_lane"),
             ("adopt_cutoff", "+ cutoff-aware promise (85%)", "f_cutoff"),
             ("adopt_warehouse", "+ warehouse fallback (60%)", "f_stock"),
             ("adopt_all", "+ last-mile watch (30%): full programme", "f_route")]
    out, rates = [], {}
    for key, label, flag in steps:
        rates = {**rates, flag: ADOPTION[flag]}
        out.append(Scenario(key, label, "adoption", FLAGS, rates=dict(rates)))
    return out


SCENARIOS = [
    Scenario("today", "Today", "reference", FLAGS),
    Scenario("route_only", "Routing engine: route overruns only", "reference", FLAGS, ["f_route"]),
    Scenario("carrier_only", "Carrier lanes only", "reference", FLAGS, ["f_lane"]),
    Scenario("vendor_best", "Routing engine best case (lanes + routes)", "reference", FLAGS, ["f_lane", "f_route"]),
    Scenario("address_only", "Address only", "reference", FLAGS, ["f_addr"]),
    Scenario("address_lanes", "Address + lanes", "reference", FLAGS, ["f_addr", "f_lane"]),
    Scenario("addr_cut_stock", "Address + cut-off + stock", "reference", FLAGS, ["f_addr", "f_cutoff", "f_stock"]),
    Scenario("all_but_route", "Address + cut-off + stock + lanes", "reference", FLAGS, ["f_addr", "f_cutoff", "f_stock", "f_lane"]),
    Scenario("second_pick", "Second pick run at 11:00", "area", PICK_FLAGS, ["f_cut_early"]),
    Scenario("area_email", "Email area: email addresses", "area", AREA_FLAGS, ["f_addr_email"]),
    Scenario("area_warehouse", "Warehouse area: cut-off + skipped nearest", "area", AREA_FLAGS, ["f_cutoff", "f_skip_nearest"]),
    Scenario("area_carriers", "Carriers area: 5 bad lanes + Friday cap on D", "area", FLAGS, ["f_lane"]),
    Scenario("as_built", "LateLens as built (full fix)", "as_built", AREA_FLAGS, AS_BUILT),
    Scenario("as_built_adopted", "LateLens as built (expected adoption)", "as_built", AREA_FLAGS, rates=AS_BUILT_ADOPTION),
    Scenario("as_built_api_edi", "As built + API/EDI address checks", "phase2", AREA_FLAGS, [*AS_BUILT, "f_addr_other"]),
    Scenario("as_built_oos", "As built + out-of-stock fixed", "phase2", AREA_FLAGS, [*AS_BUILT, "f_stock_out"]),
    Scenario("as_built_phase2", "As built + both", "phase2", AREA_FLAGS, [*AS_BUILT, "f_addr_other", "f_stock_out"]),
    *_waterfall(),
    Scenario("adopt_vendor", "Routing vendor only (all lanes, 30% of detours)", "adoption", FLAGS,
             rates={"f_lane": 1.0, "f_route": ADOPTION["f_route"]}),
]


def estimate(d: pd.DataFrame, s: Scenario) -> pd.Series:
    return adopted(d, s.rates, s.flags) if s.rates else if_fixed(d, s.fix, s.flags)


def scenario_results(d: pd.DataFrame, penalties: pd.DataFrame) -> pd.DataFrame:
    ratio = paid_ratio(d, penalties)
    segs = segments(d)
    rows = []
    for s in SCENARIOS:
        est = estimate(d, s)
        for seg, mask in segs.items():
            late_avoided, usd = cost_avoided(d[mask], est[mask], ratio)
            rows.append({"scenario": s.key, "label": s.label, "grp": s.grp, "segment": seg,
                         "on_time": 1 - float(est[mask].mean()), "late_avoided": late_avoided, "cost_avoided": usd})
    return pd.DataFrame(rows)


CAUSE_LABEL = {"f_addr": "Incomplete address", "f_stock": "Wrong warehouse (stock-out)", "f_cutoff": "Same-day promise after cutoff",
               "f_lane": "Carrier lane / Friday overload", "f_route": "Last-mile route detour"}
CAUSE_STAGE = {"f_addr": "Intake", "f_stock": "Fulfilment", "f_cutoff": "Promise", "f_lane": "Carrier", "f_route": "Delivery"}


def cause_attribution(d: pd.DataFrame) -> pd.DataFrame:
    pts = shapley(d, FLAGS)
    rows = [{"cause": f, "label": CAUSE_LABEL[f], "stage": CAUSE_STAGE[f], "deliveries": int(d[f].sum()),
             "points_lost": v, "share_of_lateness": v / sum(pts.values())} for f, v in pts.items()]
    return pd.DataFrame(rows).sort_values("points_lost", ascending=False).reset_index(drop=True)
```

Replace `analytics/core/build.py` with the final version:

```python
"""Core pipeline step (owner B): diagnosis tables and replay."""
import pandas as pd

from analytics.core import diagnosis
from analytics.core.context import Ctx
from analytics.core.load import DATE_COLS
from analytics.core.scenarios import cause_attribution, scenario_results


def build(ctx: Ctx) -> dict[str, pd.DataFrame]:
    penalties = ctx.csv("sla_penalties.csv")
    complaints = ctx.csv("complaints.csv")
    d = diagnosis.add_dq(ctx.d)
    ctx.d = d
    raw_cols = list(pd.read_csv(ctx.data_dir / "deliveries.csv", nrows=0).columns)
    clean = d[raw_cols + ["dq_bad_dates", "dq_dup_order_id"]].copy()
    for col in DATE_COLS:
        clean[col] = clean[col].astype("datetime64[us]")
    return {
        "deliveries_clean": clean,
        "clients": ctx.clients,
        "carriers": ctx.csv("carriers.csv"),
        "warehouses": ctx.csv("warehouses.csv"),
        "delivery_causes": diagnosis.delivery_causes(d),
        "dq_report": diagnosis.dq_report(d, penalties),
        "kpis": diagnosis.kpis(d, ctx.clients, penalties),
        "cause_summary": diagnosis.cause_summary(d),
        "accounts": diagnosis.accounts(d, ctx.clients, complaints),
        "scenario_results": scenario_results(d, penalties),
        "cause_attribution": cause_attribution(d),
        "cause_kpis": diagnosis.cause_kpis(d, complaints),
    }
```

- [ ] **Step 4: Run.** `python -m pytest analytics/tests/test_scenarios.py -v` — Expected: 35 passed (23 golden scenarios, 6 segment checks, the programme waterfall 71.0 → 92.0% with vendor 78.3%, adoption = full fix at 100%, attribution 7.6 / 7.0 / 5.6 / 5.6 / 3.2, and 3 others). If a golden value is off by 0.1, do not change the test: compare your flag sets with SPEC §2.4 "Flag sets".

- [ ] **Step 5: Commit.** `git add analytics && git commit -m "feat(b): replay scenarios with golden tests (SPEC §2.4)"`

---

### Task B7: Warehouse tables (W4 data, W7) — distances, nearest per client, stats, unpaid penalties

**Files:**
- Create: `analytics/warehouse/tables.py`
- Modify: `analytics/warehouse/__init__.py`
- Test: `analytics/tests/test_warehouse.py`

**Interfaces:**
- Consumes: `ctx.d` with flags (B3) and `unpaid_penalties` (B5).
- Produces tables: `warehouse_region_distance` (20 rows), `client_region_nearest`, `warehouse_stats` (5 rows), `penalty_reconciliation` (2,002 rows).

- [ ] **Step 1: Write the failing test** `analytics/tests/test_warehouse.py` (includes AC-PEN-01):

```python
import pandas as pd

from analytics.core.load import DATA_DIR
from analytics.warehouse import tables


def test_region_distance_long_form():
    out = tables.region_distance(pd.read_csv(DATA_DIR / "warehouse_region_distance_miles.csv"))
    assert len(out) == 20
    assert int(out.query("warehouse_id == 'W1' and region == 'Midwest'").miles.iloc[0]) == 150


def test_client_region_nearest_one_row_per_pair(d):
    out = tables.client_region_nearest(d)
    assert not out.duplicated(["client_id", "region"]).any()
    assert set(out.query("region == 'Northeast'").warehouse_id) == {"W4"}
    assert set(out.query("region == 'Midwest'").warehouse_id) <= {"W1", "W2"}


def test_warehouse_stats_totals(d):
    s = tables.warehouse_stats(d, pd.read_csv(DATA_DIR / "warehouses.csv"))
    assert len(s) == 5
    assert (int(s.cutoff_misses.sum()), int(s.cutoff_before_11.sum()), int(s.out_of_stock.sum()),
            int(s.skipped_nearest.sum())) == (4826, 2414, 6009, 691)


def test_ac_pen_01_unpaid(d, penalties):
    assert len(tables.penalty_reconciliation(d, penalties)) == 2002
```

- [ ] **Step 2: Run it.** Expected: FAIL, `ImportError: cannot import name 'tables'`.

- [ ] **Step 3: Implement** `analytics/warehouse/tables.py`:

```python
"""Warehouse & promise tables (owner B): W4, W6, W7 and lookups used by Node."""
import pandas as pd

from analytics.core.diagnosis import unpaid_penalties


def region_distance(distance_wide: pd.DataFrame) -> pd.DataFrame:
    return distance_wide.melt(id_vars="warehouse_id", var_name="region", value_name="miles")


def client_region_nearest(d: pd.DataFrame) -> pd.DataFrame:
    counts = d.groupby(["client_id", "destination_region", "nearest_warehouse_id"]).size().rename("n").reset_index()
    top = counts.sort_values(["client_id", "destination_region", "n", "nearest_warehouse_id"],
                             ascending=[True, True, False, True])
    top = top.drop_duplicates(["client_id", "destination_region"])
    return top.rename(columns={"destination_region": "region", "nearest_warehouse_id": "warehouse_id"})[
        ["client_id", "region", "warehouse_id"]].reset_index(drop=True)


def warehouse_stats(d: pd.DataFrame, warehouses: pd.DataFrame) -> pd.DataFrame:
    def rate(s: pd.DataFrame) -> float:
        return float(s.late.mean()) if len(s) else 0.0

    rows = []
    for wid, s in d.groupby("nearest_warehouse_id"):
        rows.append({
            "warehouse_id": wid,
            "orders": len(s),
            "cutoff_misses": int(s.f_cutoff.sum()),
            "cutoff_late_rate": rate(s[s.f_cutoff]),
            "cutoff_before_11": int(s.f_cut_early.sum()),
            "out_of_stock": int(s.f_stock_out.sum()),
            "out_of_stock_late_rate": rate(s[s.f_stock_out]),
            "skipped_nearest": int(s.f_skip_nearest.sum()),
            "skipped_nearest_late_rate": rate(s[s.f_skip_nearest]),
        })
    out = pd.DataFrame(rows).merge(warehouses[["warehouse_id", "warehouse_name"]], on="warehouse_id")
    return out[["warehouse_id", "warehouse_name", *[c for c in out.columns if c not in ("warehouse_id", "warehouse_name")]]]


def penalty_reconciliation(d: pd.DataFrame, penalties: pd.DataFrame) -> pd.DataFrame:
    rows = unpaid_penalties(d, penalties)
    out = rows[["delivery_id", "client_id", "account_tier", "days_late", "promised_date"]].copy()
    out["promised_date"] = out.promised_date.dt.strftime("%Y-%m-%d")
    return out.sort_values(["account_tier", "days_late"], ascending=[True, False]).reset_index(drop=True)
```

and `analytics/warehouse/__init__.py`:

```python
"""Warehouse pipeline step (owner B). Synthetic stock is added in Task B11."""
import pandas as pd

from analytics.core.context import Ctx
from analytics.warehouse import tables


def build(ctx: Ctx) -> dict[str, pd.DataFrame]:
    d = ctx.d
    penalties = ctx.csv("sla_penalties.csv")
    return {
        "warehouse_region_distance": tables.region_distance(ctx.csv("warehouse_region_distance_miles.csv")),
        "client_region_nearest": tables.client_region_nearest(d),
        "warehouse_stats": tables.warehouse_stats(d, ctx.csv("warehouses.csv")),
        "penalty_reconciliation": tables.penalty_reconciliation(d, penalties),
    }
```

- [ ] **Step 4: Run.** `python -m pytest && python -m analytics.pipeline --test-db` — Expected: all pass; tables written.

- [ ] **Step 5: Commit.** `git add analytics && git commit -m "feat(b): warehouse stats, nearest-warehouse lookup, unpaid penalties"`

---

### Task B8: Promise and warehouse rules in Node (W1–W3) — replaces the stub A is using

**Files:**
- Create: `api/src/modules/warehouse/domain.ts`, `api/src/modules/warehouse/lookups.ts`
- Modify: `api/src/modules/warehouse/index.ts` (stub → real)
- Test: `api/test/warehouse/domain.test.ts`

**Interfaces:**
- Consumes: tables `warehouse_region_distance`, `client_region_nearest`, `delivery_causes` (B5, B7).
- Produces (CONTRACTS §1–3): `checkPromise(commitment, receivedAt)`, `chooseWarehouse(input, milesToRegion)`, `linkExpiry(createdAt, cutoffHour = 8)`, `addDays(date, n)`, `LEAD_DAYS`, `CUTOFF_HOUR`; real `warehouseApi` and `diagnosisApi` (`getDeliveryCauses`).

- [ ] **Step 1: Write the failing test** `api/test/warehouse/domain.test.ts` (AC-PRO-01 to -04):

```ts
import { describe, expect, it } from 'vitest';
import { addDays, checkPromise, chooseWarehouse, linkExpiry } from '../../src/modules/warehouse/domain.js';

const MILES_MIDWEST = { W1: 150, W2: 200, W3: 700, W4: 800, W5: 1700 };

describe('promise rules', () => {
  it('AC-PRO-01: same-day at 08:00 becomes next day with a reason; 07:59 keeps same day', () => {
    const late = checkPromise('same_day', '2026-10-26 08:00');
    expect(late).toMatchObject({ commitment: 'next_day', promiseDate: '2026-10-28', downgraded: true });
    expect(late.reason).toContain('08:00');
    expect(checkPromise('same_day', '2026-10-26 07:59')).toEqual({
      commitment: 'same_day', promiseDate: '2026-10-27', downgraded: false, reason: null,
    });
  });

  it('uses the data lead times for next day and standard', () => {
    expect(checkPromise('next_day', '2026-10-26 15:00').promiseDate).toBe('2026-10-28');
    expect(checkPromise('standard', '2026-10-30 09:00').promiseDate).toBe('2026-11-03');
  });

  it('adds days across month ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });
});

describe('warehouse choice', () => {
  it('AC-PRO-02: ships from the nearest warehouse when it has stock', () => {
    const c = chooseWarehouse({ destinationRegion: 'Southeast', nearestWarehouseId: 'W3', stock: {} }, MILES_MIDWEST);
    expect(c).toMatchObject({ warehouseId: 'W3', warnClient: false });
  });

  it('AC-PRO-03: Midwest order nearest W1 with W1 short goes to partner W2 first', () => {
    const c = chooseWarehouse({ destinationRegion: 'Midwest', nearestWarehouseId: 'W1', stock: { W1: false } }, MILES_MIDWEST);
    expect(c).toMatchObject({ warehouseId: 'W2', warnClient: false });
  });

  it('falls back to the closest warehouse with stock and warns the client', () => {
    const c = chooseWarehouse(
      { destinationRegion: 'Midwest', nearestWarehouseId: 'W1', stock: { W1: false, W2: false } }, MILES_MIDWEST,
    );
    expect(c).toMatchObject({ warehouseId: 'W3', warnClient: true });
  });
});

describe('confirm-address link expiry', () => {
  it('AC-PRO-04: link created 10:00 with an 08:00 cut-off expires 06:00 next day', () => {
    expect(linkExpiry('2026-10-26 10:00')).toBe('2026-10-27 06:00');
  });

  it('before the cut-off: expires 2 h before today\'s cut-off', () => {
    expect(linkExpiry('2026-10-26 05:00')).toBe('2026-10-26 06:00');
  });
});
```

- [ ] **Step 2: Run it.** `npm test -w api -- test/warehouse` — Expected: FAIL, cannot find `domain.js`.

- [ ] **Step 3: Implement** `api/src/modules/warehouse/domain.ts`:

```ts
import type {
  Commitment, IsoDate, LocalTimestamp, PickWarehouseInput, PromiseResult, WarehouseChoice, WarehouseId,
} from '../../core/contracts.js';

export const CUTOFF_HOUR = 8;
/** Calendar days from order date to promised date, as in the data (CONTRACTS §3). */
export const LEAD_DAYS: Record<Commitment, number> = { same_day: 1, next_day: 2, standard: 4 };
const PARTNER: Partial<Record<WarehouseId, WarehouseId>> = { W1: 'W2', W2: 'W1' };
const TS = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/;
const DAY_MS = 86_400_000;

function parse(ts: LocalTimestamp): { date: IsoDate; hour: number; minute: number } {
  const m = TS.exec(ts);
  if (!m) throw new Error(`bad local timestamp: ${ts}`);
  return { date: m[1], hour: Number(m[2]), minute: Number(m[3]) };
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** W1: promise a date the pick list can actually meet. */
export function checkPromise(commitment: Commitment, receivedAt: LocalTimestamp): PromiseResult {
  const { date, hour, minute } = parse(receivedAt);
  if (commitment === 'same_day' && hour >= CUTOFF_HOUR) {
    const at = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    return {
      promiseDate: addDays(date, LEAD_DAYS.next_day),
      commitment: 'next_day',
      downgraded: true,
      reason: `Received at ${at}, after the 0${CUTOFF_HOUR}:00 pick-list cut-off, so it goes on the next day's pick list.`,
    };
  }
  return { promiseDate: addDays(date, LEAD_DAYS[commitment]), commitment, downgraded: false, reason: null };
}

/** W2/W3: nearest first, then the same-region partner, then the closest warehouse with stock. */
export function chooseWarehouse(input: PickWarehouseInput, milesToRegion: Record<WarehouseId, number>): WarehouseChoice {
  const { nearestWarehouseId: nearest, stock } = input;
  if (stock[nearest] !== false) {
    return { warehouseId: nearest, reason: `Nearest warehouse ${nearest} has stock.`, warnClient: false };
  }
  const partner = PARTNER[nearest];
  if (partner && stock[partner] !== false) {
    return {
      warehouseId: partner,
      reason: `${nearest} is out of stock; partner warehouse ${partner} in the same region ships it.`,
      warnClient: false,
    };
  }
  const others = (Object.keys(milesToRegion) as WarehouseId[])
    .filter((w) => w !== nearest && w !== partner && stock[w] !== false)
    .sort((a, b) => milesToRegion[a] - milesToRegion[b]);
  if (others.length === 0) {
    return { warehouseId: nearest, reason: `No warehouse has stock; holding at ${nearest}.`, warnClient: true };
  }
  const w = others[0];
  return {
    warehouseId: w,
    reason: `${nearest} is out of stock; ${w} is the closest warehouse with stock (${milesToRegion[w]} miles).`,
    warnClient: true,
  };
}

function toLocal(ms: number): LocalTimestamp {
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
}

/** REQ-PRO-04: confirm-address links expire at min(24 h, 2 h before the next cut-off). */
export function linkExpiry(createdAt: LocalTimestamp, cutoffHour = CUTOFF_HOUR): LocalTimestamp {
  const { date, hour, minute } = parse(createdAt);
  const created = Date.parse(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`);
  const todayCutoff = Date.parse(`${date}T${String(cutoffHour).padStart(2, '0')}:00:00Z`);
  const nextCutoff = created < todayCutoff ? todayCutoff : todayCutoff + DAY_MS;
  return toLocal(Math.min(created + DAY_MS, nextCutoff - 2 * 3_600_000));
}
```

`api/src/modules/warehouse/lookups.ts`:

```ts
import { cached } from '../../core/cache.js';
import type { CauseFlag, DeliveryCauses, Region, WarehouseId } from '../../core/contracts.js';
import { query } from '../../core/db/pool.js';

const FLAGS: CauseFlag[] = ['f_addr', 'f_cutoff', 'f_stock', 'f_stock_out', 'f_skip_nearest', 'f_lane', 'f_bad_lane', 'f_d_friday', 'f_route'];

export async function milesToRegion(region: Region): Promise<Record<WarehouseId, number>> {
  return cached(`miles:${region}`, async () => {
    const rows = await query<{ warehouse_id: WarehouseId; miles: number }>(
      'SELECT warehouse_id, miles FROM warehouse_region_distance WHERE region = $1', [region],
    );
    return Object.fromEntries(rows.map((r) => [r.warehouse_id, r.miles])) as Record<WarehouseId, number>;
  });
}

export async function clientNearest(clientId: string, region: Region): Promise<WarehouseId | null> {
  const rows = await query<{ warehouse_id: WarehouseId }>(
    'SELECT warehouse_id FROM client_region_nearest WHERE client_id = $1 AND region = $2', [clientId, region],
  );
  return rows[0]?.warehouse_id ?? null;
}

export async function deliveryCauses(deliveryId: string): Promise<DeliveryCauses | null> {
  const rows = await query<Record<string, unknown>>('SELECT * FROM delivery_causes WHERE delivery_id = $1', [deliveryId]);
  const r = rows[0];
  if (!r) return null;
  return {
    deliveryId,
    late: Boolean(r.late),
    flags: Object.fromEntries(FLAGS.map((f) => [f, Boolean(r[f])])) as Record<CauseFlag, boolean>,
    stages: String(r.stages ?? '').split(',').filter(Boolean),
  };
}
```

Replace the stub `api/src/modules/warehouse/index.ts`:

```ts
// Public entry point of the Warehouse & promise area (CONTRACTS §2). Other areas import only this file.
import type { DiagnosisApi, Region, WarehouseApi, WarehouseId } from '../../core/contracts.js';
import { checkPromise, chooseWarehouse } from './domain.js';
import { clientNearest, deliveryCauses, milesToRegion } from './lookups.js';

const NEAREST: Record<Region, WarehouseId> = { Midwest: 'W1', Northeast: 'W4', Southeast: 'W3', West: 'W5' };

export const warehouseApi: WarehouseApi = {
  checkPromise,
  async nearestWarehouse(clientId, region) {
    if (region !== 'Midwest') return NEAREST[region];
    return (await clientNearest(clientId, region)) ?? NEAREST.Midwest;
  },
  async pickWarehouse(input) {
    return chooseWarehouse(input, await milesToRegion(input.destinationRegion));
  },
};

export const diagnosisApi: DiagnosisApi = { getDeliveryCauses: deliveryCauses };
```

- [ ] **Step 4: Run.** `npm test -w api && npm run lint -w api` — Expected: domain tests pass (8), no type errors.

- [ ] **Step 5: Commit and tell A** the real `warehouseApi` is on `main`. `git commit -am "feat(b): promise and warehouse rules (W1-W3), real warehouseApi"`

**Tuesday check-in:** golden scenario tests green (AC-REP-01); `warehouseApi` real; pipeline writes all B tables.

---

### Task B9: Read API for the Overview, Warehouses and Replay screens

**Files:**
- Create: `api/src/modules/warehouse/queries.ts`, `api/src/modules/warehouse/routes.ts`
- Test: `api/test/routes/warehouse.test.ts` (needs test database)

**Interfaces:**
- Consumes: tables `kpis`, `cause_summary`, `scenario_results`, `accounts`, `warehouse_stats`, `penalty_reconciliation`, `placement_suggestions`, `placement_impact`.
- Produces endpoints (CONTRACTS §6): `GET /api/overview`, `/api/causes?segment=`, `/api/replay?segment=`, `/api/accounts`, `/api/attribution`, `/api/cause-kpis`, `/api/warehouses`, `/api/penalties/unpaid`, `/api/placement` (tables filled in B11). Also used by C's MCP server: `overview()`, `causes(segment)`, `replay(segment)`.

- [ ] **Step 1: Write the failing test** `api/test/routes/warehouse.test.ts` (AC-UI-01 data, AC-PEN-01 via API, AC-DIAG-06, AC-NFR-01, contract checks):

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool } from '../../src/core/db/pool.js';
import { diagnosisApi, warehouseApi } from '../../src/modules/warehouse/index.js';
import { buildApp } from '../../src/server.js';
import { hasDb } from '../db.js';

describe.skipIf(!hasDb)('warehouse & diagnosis routes (needs test database)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => pool.end());
  const get = async (url: string) => (await app.inject({ method: 'GET', url })).json();

  it('AC-UI-01 (data): overview shows 71.0% on-time', async () => {
    const o = await get('/api/overview');
    expect(o.onTime).toBeCloseTo(0.71, 3);
    expect(o).toMatchObject({ late: 14019, penaltiesUsd: 872460, atRiskAccounts: 9 });
  });

  it('serves causes and replay per segment, and rejects unknown segments', async () => {
    expect((await get('/api/causes?segment=email')).causes.length).toBeGreaterThan(5);
    const replay = await get('/api/replay?segment=all');
    expect(replay.scenarios.find((s: { scenario: string }) => s.scenario === 'adopt_all').onTime).toBeCloseTo(0.92, 3);
    expect((await app.inject({ method: 'GET', url: '/api/causes?segment=nope' })).statusCode).toBe(400);
  });

  it('AC-PEN-01 and second pick through the API', async () => {
    expect((await get('/api/penalties/unpaid')).count).toBe(2002);
    const w = await get('/api/warehouses');
    expect(w.secondPick.movedOrders).toBe(2414);
    expect(w.secondPick.onTime).toBeCloseTo(0.734, 3);
  });

  it('AC-DIAG-06: attribution sums to the late rate; one KPI per cause', async () => {
    const a = await get('/api/attribution');
    expect(a.causes.reduce((s: number, c: { pointsLost: number }) => s + c.pointsLost, 0)).toBeCloseTo(0.29, 2);
    expect(a.causes[0].cause).toBe('f_lane');
    const k = await get('/api/cause-kpis');
    expect(new Set(k.kpis.map((x: { cause: string }) => x.cause))).toEqual(new Set(['f_addr', 'f_lane', 'f_stock', 'f_cutoff', 'f_route', 'none']));
  });

  it('contract: nearestWarehouse and getDeliveryCauses read the Python tables', async () => {
    expect(['W1', 'W2']).toContain(await warehouseApi.nearestWarehouse('C003', 'Midwest'));
    expect(await warehouseApi.nearestWarehouse('C003', 'West')).toBe('W5');
    const c = await diagnosisApi.getDeliveryCauses('D000002');
    expect(c?.stages).toContain('Fulfilment');
  });

  it('AC-NFR-01: read endpoints answer within 2 s at p95', async () => {
    const times: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      const t = performance.now();
      await app.inject({ method: 'GET', url: '/api/overview' });
      times.push(performance.now() - t);
    }
    expect(times.sort((a, b) => a - b)[18]).toBeLessThan(2000);
  });
});
```

- [ ] **Step 2: Run it.** `python -m analytics.pipeline --test-db && npm test -w api -- test/routes/warehouse` — Expected: FAIL, 404s on `/api/overview`.

- [ ] **Step 3: Implement** `api/src/modules/warehouse/queries.ts` and `routes.ts`:

```ts
import { cached } from '../../core/cache.js';
import { query } from '../../core/db/pool.js';

export const SEGMENTS = ['all', 'email', 'at_risk'] as const;
export const REPLAY_SEGMENTS = ['all', 'email', 'at_risk', 'aug_sep'] as const;

export const overview = () => cached('overview', async () => {
  const rows = await query<{ key: string; value: number }>('SELECT key, value FROM kpis');
  const k = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    onTime: k.on_time, benchmark: k.benchmark, deliveries: k.deliveries, late: k.late, penaltiesUsd: k.penalties_usd,
    handlingCostUsd: k.handling_cost_usd, atRiskAccounts: k.at_risk_accounts, atRiskRevenueUsd: k.at_risk_revenue_usd,
    prePickupShare: k.pre_pickup_share,
  };
});

export const causes = (segment: string) => cached(`causes:${segment}`, async () => ({
  segment,
  causes: (await query<{ flag: string; label: string; stage: string; n: number; late_rate: number }>(
    'SELECT flag, label, stage, n, late_rate FROM cause_summary WHERE segment = $1', [segment],
  )).map((r) => ({ flag: r.flag, label: r.label, stage: r.stage, n: r.n, lateRate: r.late_rate })),
}));

export const replay = (segment: string) => cached(`replay:${segment}`, async () => ({
  segment,
  scenarios: (await query<{ scenario: string; label: string; grp: string; on_time: number; late_avoided: number; cost_avoided: number }>(
    'SELECT scenario, label, grp, on_time, late_avoided, cost_avoided FROM scenario_results WHERE segment = $1', [segment],
  )).map((r) => ({ scenario: r.scenario, label: r.label, grp: r.grp, onTime: r.on_time,
    lateAvoided: Math.round(r.late_avoided), costAvoided: Math.round(r.cost_avoided) })),
}));

interface AccountRow {
  client_id: string; client_name: string; account_tier: string; annual_revenue_usd: number; primary_order_channel: string;
  deliveries: number; on_time: number; main_cause: string; complaints: number;
}

interface WarehouseStatsRow {
  warehouse_id: string; warehouse_name: string; orders: number; cutoff_misses: number; cutoff_late_rate: number;
  cutoff_before_11: number; out_of_stock: number; out_of_stock_late_rate: number; skipped_nearest: number;
  skipped_nearest_late_rate: number;
}

export const accounts = () => cached('accounts', async () => ({
  accounts: (await query<AccountRow>('SELECT * FROM accounts ORDER BY annual_revenue_usd DESC')).map((r) => ({
    clientId: r.client_id, clientName: r.client_name, tier: r.account_tier, revenueUsd: r.annual_revenue_usd,
    channel: r.primary_order_channel, deliveries: r.deliveries, onTime: r.on_time, mainCause: r.main_cause, complaints: r.complaints,
  })),
}));

export const warehouses = () => cached('warehouses', async () => {
  const rows = await query<WarehouseStatsRow>('SELECT * FROM warehouse_stats ORDER BY warehouse_id');
  const pick = await query<{ on_time: number }>(
    "SELECT on_time FROM scenario_results WHERE scenario = 'second_pick' AND segment = 'all'",
  );
  return {
    warehouses: rows.map((r) => ({
      warehouseId: r.warehouse_id, name: r.warehouse_name, orders: r.orders, cutoffMisses: r.cutoff_misses,
      cutoffLateRate: r.cutoff_late_rate, cutoffBefore11: r.cutoff_before_11, outOfStock: r.out_of_stock,
      outOfStockLateRate: r.out_of_stock_late_rate, skippedNearest: r.skipped_nearest, skippedNearestLateRate: r.skipped_nearest_late_rate,
    })),
    secondPick: { movedOrders: rows.reduce((a, r) => a + r.cutoff_before_11, 0), onTime: pick[0]?.on_time ?? null },
  };
});

export const attribution = () => cached('attribution', async () => ({
  causes: (await query<{ cause: string; label: string; stage: string; deliveries: number; points_lost: number; share_of_lateness: number }>(
    'SELECT * FROM cause_attribution ORDER BY points_lost DESC',
  )).map((r) => ({ cause: r.cause, label: r.label, stage: r.stage, deliveries: r.deliveries, pointsLost: r.points_lost,
    share: r.share_of_lateness })),
}));

export const causeKpis = () => cached('cause-kpis', async () => ({
  kpis: await query<{ cause: string; label: string; kpi: string; baseline: number; target: string; owner: string }>(
    'SELECT cause, label, kpi, baseline, target, owner FROM cause_kpis',
  ),
}));

export const unpaidPenalties = () => cached('unpaid', async () => {
  const byTier = await query<{ tier: string; n: number }>(
    'SELECT account_tier AS tier, count(*) AS n FROM penalty_reconciliation GROUP BY account_tier ORDER BY account_tier',
  );
  const rows = await query<{ delivery_id: string; client_id: string; account_tier: string; days_late: number; promised_date: string }>(
    'SELECT * FROM penalty_reconciliation ORDER BY account_tier, days_late DESC LIMIT 200',
  );
  return {
    count: byTier.reduce((a, r) => a + r.n, 0),
    byTier,
    rows: rows.map((r) => ({ deliveryId: r.delivery_id, clientId: r.client_id, tier: r.account_tier, daysLate: r.days_late,
      promisedDate: r.promised_date })),
  };
});

export const placement = () => cached('placement', async () => {
  const [latest] = await query<{ week: string }>('SELECT max(week) AS week FROM placement_suggestions');
  const suggestions = await query<{ client_id: string; sku: string; from_warehouse: string; to_warehouse: string; qty: number; reason: string }>(
    'SELECT * FROM placement_suggestions WHERE week = $1 ORDER BY qty DESC LIMIT 50', [latest?.week],
  );
  const impact = await query<{ week: string; suggestions: number; avoided_next_week: number }>(
    'SELECT week, suggestions, avoided_next_week FROM placement_impact ORDER BY week',
  );
  return {
    synthetic: true as const,
    week: latest?.week ?? null,
    suggestions: suggestions.map((s) => ({ clientId: s.client_id, sku: s.sku, from: s.from_warehouse, to: s.to_warehouse, qty: s.qty, reason: s.reason })),
    impact: impact.map((i) => ({ week: i.week, suggestions: i.suggestions, avoidedNextWeek: i.avoided_next_week })),
  };
});
```

```ts
import type { FastifyPluginAsync } from 'fastify';
import * as q from './queries.js';

const routes: FastifyPluginAsync = async (app) => {
  app.get('/overview', async () => q.overview());

  app.get<{ Querystring: { segment?: string } }>('/causes', async (req, reply) => {
    const segment = req.query.segment ?? 'all';
    if (!(q.SEGMENTS as readonly string[]).includes(segment)) return reply.code(400).send({ error: `segment must be one of ${q.SEGMENTS.join(', ')}` });
    return q.causes(segment);
  });

  app.get<{ Querystring: { segment?: string } }>('/replay', async (req, reply) => {
    const segment = req.query.segment ?? 'all';
    if (!(q.REPLAY_SEGMENTS as readonly string[]).includes(segment)) return reply.code(400).send({ error: `segment must be one of ${q.REPLAY_SEGMENTS.join(', ')}` });
    return q.replay(segment);
  });

  app.get('/accounts', async () => q.accounts());
  app.get('/attribution', async () => q.attribution());
  app.get('/cause-kpis', async () => q.causeKpis());
  app.get('/warehouses', async () => q.warehouses());
  app.get('/penalties/unpaid', async () => q.unpaidPenalties());
  app.get('/placement', async () => q.placement());
};

export default routes;
```

- [ ] **Step 4: Run.** Expected: 6 passed. `curl localhost:3001/api/overview` shows `onTime: 0.70999…`; `curl localhost:3001/api/attribution` lists carrier lane first at 0.0763.

- [ ] **Step 5: Commit.** `git add api && git commit -m "feat(b): overview, causes, replay, accounts, warehouse and penalty endpoints"`

---

### Task B10: Overview, Warehouses and Replay & decision screens (D3, D5, D6, W4)

**Files:**
- Create: `web/src/features/overview/index.tsx`, `web/src/features/warehouses/index.tsx`, `web/src/features/replay/index.tsx`
- Test: `web/src/features/overview/overview.test.tsx`, `web/src/features/warehouses/warehouses.test.tsx`, `web/src/features/replay/replay.test.tsx`

**Interfaces:**
- Consumes: B9 endpoints; `useApi`, `Table`, `Kpi`, `Section`, `SyntheticBadge`, formatters (B2).
- Produces: screens at `/overview` (order 10: KPIs, points lost per cause, one measure per cause, late rate by cause), `/warehouses` (30), `/replay` (50: expected-adoption programme waterfall vs routing vendor, full-fix bounds, recommendation).

- [ ] **Step 1: Write the failing tests** (AC-UI-01/02, AC-UI-04, recommendation built from API numbers):

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockApi, renderScreen } from '../../app/test-utils';
import { OverviewScreen } from './index';

describe('Overview', () => {
  it('AC-UI-01/02: shows the on-time rate and causes from the API', async () => {
    mockApi({
      '/api/overview': { onTime: 0.71, benchmark: 0.94, deliveries: 48340, late: 14019, penaltiesUsd: 872460, handlingCostUsd: 476646,
        atRiskAccounts: 9, atRiskRevenueUsd: 14200000, prePickupShare: 0.673 },
      '/api/causes?segment=all': { segment: 'all', causes: [{ flag: 'f_addr', label: 'Incomplete address at intake', stage: 'Intake', n: 5994, lateRate: 0.646 }] },
      '/api/attribution': { causes: [{ cause: 'f_lane', label: 'Carrier lane / Friday overload', stage: 'Carrier', deliveries: 10030, pointsLost: 0.0763, share: 0.263 }] },
      '/api/cause-kpis': { kpis: [{ cause: 'f_addr', label: 'Incomplete address', kpi: 'Orders with an incomplete address at the pick list', baseline: 0.124, target: '<2%', owner: 'Customer success' }] },
    });
    renderScreen(<OverviewScreen />);
    expect(await screen.findByText('71.0%')).toBeTruthy();
    expect(await screen.findByText('$872,460')).toBeTruthy();
    expect((await screen.findAllByText('Incomplete address at intake')).length).toBeGreaterThan(0);
    expect(await screen.findByText('7.6')).toBeTruthy();
    expect(await screen.findByText('12.4%')).toBeTruthy();
  });
});
```

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockApi, renderScreen } from '../../app/test-utils';
import { WarehousesScreen } from './index';

describe('Warehouses', () => {
  it('AC-UI-04: the placement panel carries the synthetic badge', async () => {
    mockApi({
      '/api/warehouses': { warehouses: [{ warehouseId: 'W4', name: 'Northeast', orders: 12668, cutoffMisses: 1200, cutoffLateRate: 0.6,
        cutoffBefore11: 600, outOfStock: 1568, outOfStockLateRate: 0.5, skippedNearest: 150, skippedNearestLateRate: 0.49 }],
        secondPick: { movedOrders: 2414, onTime: 0.732 } },
      '/api/placement': { synthetic: true, week: '2026-09-21', suggestions: [], impact: [] },
      '/api/penalties/unpaid': { count: 2002, byTier: [{ tier: 'Tier 1', n: 500 }], rows: [] },
    });
    renderScreen(<WarehousesScreen />);
    expect(await screen.findByText('Synthetic data')).toBeTruthy();
    expect(await screen.findByText(/73\.2%/)).toBeTruthy();
    expect(await screen.findByText(/2,002 late deliveries/)).toBeTruthy();
  });
});
```

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockApi, renderScreen } from '../../app/test-utils';
import { ReplayScreen } from './index';

const s = (scenario: string, label: string, onTime: number, costAvoided: number) => ({ scenario, label, grp: 'reference', onTime, lateAvoided: 1, costAvoided });

describe('Replay & decision', () => {
  it('builds the recommendation sentence from API numbers', async () => {
    mockApi({
      '/api/replay?segment=all': { segment: 'all', scenarios: [
        s('today', 'Today', 0.71, 0), s('route_only', 'Route only', 0.736, 113347), s('adopt_vendor', 'Vendor only', 0.783, 320482),
        s('as_built_adopted', 'As built (adoption)', 0.859, 707950), s('adopt_all', 'Full programme', 0.92, 980764)] },
      '/api/accounts': { accounts: [] },
      '/api/overview': { benchmark: 0.94 },
    });
    renderScreen(<ReplayScreen />);
    expect(await screen.findByText(/routing vendor alone reaches 78\.3%/)).toBeTruthy();
    expect(await screen.findByText(/Fixing all five causes reaches 92\.0%/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run them.** `npm test -w web` — Expected: FAIL, cannot resolve `./index`.

- [ ] **Step 3: Implement the three screens.**

```tsx
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Feature } from '../../app/features';
import { int, pct, usd } from '../../app/format';
import { Kpi, Section, Status, Table, useApi } from '../../app/ui';
import { useState } from 'react';

export interface Overview {
  onTime: number; benchmark: number; deliveries: number; late: number; penaltiesUsd: number; handlingCostUsd: number;
  atRiskAccounts: number; atRiskRevenueUsd: number; prePickupShare: number;
}
export interface Cause { flag: string; label: string; stage: string; n: number; lateRate: number }
interface Attribution { cause: string; label: string; stage: string; deliveries: number; pointsLost: number; share: number }
interface CauseKpi { cause: string; label: string; kpi: string; baseline: number; target: string; owner: string }

const PRE_PICKUP = new Set(['Intake', 'Promise', 'Fulfilment']);

export function OverviewScreen() {
  const [segment, setSegment] = useState('all');
  const o = useApi<Overview>('/api/overview');
  const c = useApi<{ causes: Cause[] }>(`/api/causes?segment=${segment}`);
  const a = useApi<{ causes: Attribution[] }>('/api/attribution');
  const k = useApi<{ kpis: CauseKpi[] }>('/api/cause-kpis');
  const causes = (c.data?.causes ?? []).filter((x) => ['f_addr', 'f_cutoff', 'f_stock', 'f_lane', 'f_route', 'none'].includes(x.flag));
  return (
    <>
      <Section title="Where Halcyon stands">
        <Status loading={o.loading} error={o.error} />
        {o.data && (
          <div className="kpis">
            <Kpi label="On-time delivery" value={pct(o.data.onTime)} note={`benchmark ${pct(o.data.benchmark, 0)}`} />
            <Kpi label="Late deliveries (6 months)" value={int(o.data.late)} />
            <Kpi label="Late deliveries with a cause before pickup" value={pct(o.data.prePickupShare, 0)} />
            <Kpi label="SLA penalties" value={usd(o.data.penaltiesUsd)} />
            <Kpi label="Late-delivery handling cost" value={usd(o.data.handlingCostUsd)} />
            <Kpi label="Accounts threatening to leave" value={`${o.data.atRiskAccounts}`} note={usd(o.data.atRiskRevenueUsd)} />
          </div>
        )}
      </Section>
      <Section title="Points of on-time delivery lost to each cause">
        <Status loading={a.loading} error={a.error} />
        {a.data && <Table rows={a.data.causes} columns={[
          { key: 'l', label: 'Cause', render: (r) => r.label },
          { key: 's', label: 'Stage', render: (r) => `${r.stage}${PRE_PICKUP.has(r.stage) ? ' (before pickup)' : ''}` },
          { key: 'p', label: 'Points lost', align: 'right', render: (r) => (r.pointsLost * 100).toFixed(1) },
          { key: 'h', label: 'Share of lateness', align: 'right', render: (r) => pct(r.share, 0) },
        ]} />}
      </Section>
      <Section title="One measure per cause">
        <Status loading={k.loading} error={k.error} />
        {k.data && <Table rows={k.data.kpis} columns={[
          { key: 'l', label: 'Cause', render: (r) => r.label },
          { key: 'k', label: 'Measure', render: (r) => r.kpi },
          { key: 'b', label: 'Today', align: 'right', render: (r) => (r.baseline <= 1 && !/complaints|far warehouse/.test(r.kpi) ? pct(r.baseline) : int(r.baseline)) },
          { key: 't', label: 'Target', render: (r) => r.target },
          { key: 'o', label: 'Owner', render: (r) => r.owner },
        ]} />}
      </Section>
      <Section title="Late rate by cause">
        <div className="row">
          <label>Orders <select value={segment} onChange={(e) => setSegment(e.target.value)}>
            <option value="all">All</option><option value="email">Email orders</option><option value="at_risk">At-risk accounts</option>
          </select></label>
        </div>
        <Status loading={c.loading} error={c.error} />
        {causes.length > 0 && (
          <>
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={causes} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <XAxis type="number" tickFormatter={(v: number) => pct(v, 0)} domain={[0, 1]} />
                  <YAxis type="category" dataKey="label" width={180} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => pct(Number(v))} />
                  <Bar dataKey="lateRate" fill="var(--accent)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <Table rows={causes} columns={[
              { key: 'label', label: 'Cause', render: (r) => r.label },
              { key: 'stage', label: 'Stage', render: (r) => `${r.stage}${PRE_PICKUP.has(r.stage) ? ' (before pickup)' : ''}` },
              { key: 'n', label: 'Deliveries', align: 'right', render: (r) => int(r.n) },
              { key: 'late', label: 'Late rate', align: 'right', render: (r) => pct(r.lateRate, 0) },
            ]} />
          </>
        )}
      </Section>
    </>
  );
}

export const feature: Feature = { path: '/overview', label: 'Overview', order: 10, element: <OverviewScreen /> };
```

```tsx
import type { Feature } from '../../app/features';
import { int, pct } from '../../app/format';
import { Section, Status, SyntheticBadge, Table, useApi } from '../../app/ui';

interface WarehouseRow {
  warehouseId: string; name: string; orders: number; cutoffMisses: number; cutoffLateRate: number; cutoffBefore11: number;
  outOfStock: number; outOfStockLateRate: number; skippedNearest: number; skippedNearestLateRate: number;
}
interface Placement { week: string | null; suggestions: { clientId: string; from: string; to: string; qty: number; reason: string }[];
  impact: { week: string; suggestions: number; avoidedNextWeek: number }[] }
interface Unpaid { count: number; byTier: { tier: string; n: number }[] }

export function WarehousesScreen() {
  const w = useApi<{ warehouses: WarehouseRow[]; secondPick: { movedOrders: number; onTime: number | null } }>('/api/warehouses');
  const p = useApi<Placement>('/api/placement');
  const u = useApi<Unpaid>('/api/penalties/unpaid');
  return (
    <>
      <Section title="Problems before pickup, by warehouse">
        <Status loading={w.loading} error={w.error} />
        {w.data && <Table rows={w.data.warehouses} columns={[
          { key: 'w', label: 'Warehouse', render: (r) => `${r.warehouseId} ${r.name}` },
          { key: 'o', label: 'Orders', align: 'right', render: (r) => int(r.orders) },
          { key: 'c', label: 'Same-day after 8am', align: 'right', render: (r) => `${int(r.cutoffMisses)} (${pct(r.cutoffLateRate, 0)} late)` },
          { key: 's', label: 'Out of stock', align: 'right', render: (r) => `${int(r.outOfStock)} (${pct(r.outOfStockLateRate, 0)} late)` },
          { key: 'k', label: 'Skipped nearest', align: 'right', render: (r) => `${int(r.skippedNearest)} (${pct(r.skippedNearestLateRate, 0)} late)` },
        ]} />}
      </Section>
      {w.data && (
        <Section title="Option: second pick run at 11:00">
          <p>{int(w.data.secondPick.movedOrders)} same-day orders arrive between 08:00 and 11:00 and would make a second pick run.
            On-time would rise to {pct(w.data.secondPick.onTime)} on its own.</p>
        </Section>
      )}
      <Section title="Weekly stock placement suggestions" badge={<SyntheticBadge />}>
        <Status loading={p.loading} error={p.error} />
        {p.data && (
          <>
            <p className="muted">Week of {p.data.week}. Based on synthetic stock levels (SD-05); out-of-stock flags match the real data.</p>
            <Table rows={p.data.suggestions.slice(0, 15)} columns={[
              { key: 'c', label: 'Client', render: (r) => r.clientId },
              { key: 'm', label: 'Move', render: (r) => `${r.from} → ${r.to}` },
              { key: 'q', label: 'Units', align: 'right', render: (r) => int(r.qty) },
              { key: 'r', label: 'Why', render: (r) => r.reason },
            ]} />
          </>
        )}
      </Section>
      <Section title="Penalties possibly owed but not paid">
        <Status loading={u.loading} error={u.error} />
        {u.data && <p>{int(u.data.count)} late deliveries for clients with a penalty clause have no penalty record
          ({u.data.byTier.map((t) => `${t.tier}: ${int(t.n)}`).join(', ')}). Question for the CFO.</p>}
      </Section>
    </>
  );
}

export const feature: Feature = { path: '/warehouses', label: 'Warehouses', order: 30, element: <WarehousesScreen /> };
```

```tsx
import { useState } from 'react';
import { Bar, BarChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Feature } from '../../app/features';
import { int, pct, usd } from '../../app/format';
import { Section, Status, Table, useApi } from '../../app/ui';

interface Scenario { scenario: string; label: string; grp: string; onTime: number; lateAvoided: number; costAvoided: number }
interface Account { clientId: string; clientName: string; tier: string; revenueUsd: number; channel: string; onTime: number; mainCause: string; complaints: number }

// Expected-adoption programme (as in the diagnostic deck) against the routing vendor, then the full-fix upper bounds.
const SHOWN = ['today', 'adopt_vendor', 'adopt_address', 'adopt_lanes', 'adopt_cutoff', 'adopt_warehouse', 'adopt_all',
  'as_built_adopted', 'as_built', 'route_only', 'vendor_best'];

export function ReplayScreen() {
  const [segment, setSegment] = useState('all');
  const r = useApi<{ scenarios: Scenario[] }>(`/api/replay?segment=${segment}`);
  const a = useApi<{ accounts: Account[] }>('/api/accounts');
  const o = useApi<{ benchmark: number }>('/api/overview');
  const byKey = new Map((r.data?.scenarios ?? []).map((s) => [s.scenario, s]));
  const shown = SHOWN.map((k) => byKey.get(k)).filter((s): s is Scenario => Boolean(s));
  const vendor = byKey.get('adopt_vendor');
  const route = byKey.get('route_only');
  const built = byKey.get('as_built_adopted');
  const programme = byKey.get('adopt_all');
  return (
    <>
      <Section title="Replay of 48,340 deliveries: what if each problem were fixed?">
        <div className="row">
          <label>Orders <select value={segment} onChange={(e) => setSegment(e.target.value)}>
            <option value="all">All</option><option value="email">Email orders</option>
            <option value="at_risk">At-risk accounts</option><option value="aug_sep">Aug–Sep only</option>
          </select></label>
        </div>
        <Status loading={r.loading} error={r.error} />
        {shown.length > 0 && (
          <>
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <BarChart data={shown} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <XAxis type="number" domain={[0.6, 1]} tickFormatter={(v: number) => pct(v, 0)} />
                  <YAxis type="category" dataKey="label" width={220} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => pct(Number(v))} />
                  {o.data && <ReferenceLine x={o.data.benchmark} stroke="var(--good)" label="benchmark" />}
                  <Bar dataKey="onTime" fill="var(--accent)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <Table rows={shown} columns={[
              { key: 'l', label: 'Scenario', render: (s) => s.label },
              { key: 'o', label: 'On-time', align: 'right', render: (s) => pct(s.onTime) },
              { key: 'a', label: 'Late avoided', align: 'right', render: (s) => int(s.lateAvoided) },
              { key: 'c', label: 'Cost avoided (6 mo)', align: 'right', render: (s) => usd(s.costAvoided) },
            ]} />
          </>
        )}
      </Section>
      {vendor && route && built && programme && (
        <Section title="Recommendation on the $680K routing contract">
          <p><strong>Do not sign as scoped.</strong> With expected adoption, the routing vendor alone reaches {pct(vendor.onTime)};
            route overruns, the only cause routing fixes directly, are worth {pct(route.onTime)} on their own.
            Fixing all five causes reaches {pct(programme.onTime)} ({usd(programme.costAvoided)} avoided in 6 months);
            what we build this week reaches {pct(built.onTime)}. Run the programme, then decide on routing with evidence.</p>
        </Section>
      )}
      <Section title="The 9 accounts threatening to leave">
        <Status loading={a.loading} error={a.error} />
        {a.data && <Table rows={a.data.accounts} columns={[
          { key: 'c', label: 'Client', render: (x) => `${x.clientId} · ${x.tier}` },
          { key: 'r', label: 'Revenue', align: 'right', render: (x) => usd(x.revenueUsd) },
          { key: 'ch', label: 'Channel', render: (x) => x.channel },
          { key: 'o', label: 'On-time', align: 'right', render: (x) => pct(x.onTime) },
          { key: 'm', label: 'Main cause', render: (x) => x.mainCause },
          { key: 'k', label: 'Complaints', align: 'right', render: (x) => int(x.complaints) },
        ]} />}
      </Section>
    </>
  );
}

export const feature: Feature = { path: '/replay', label: 'Replay & decision', order: 50, element: <ReplayScreen /> };
```

- [ ] **Step 4: Run.** `npm test -w web && npm run build -w web` — Expected: PASS. With `npm run dev`, check each screen at 375 px wide in the browser's device toolbar: no sideways scrolling (AC-UI-03).

- [ ] **Step 5: Commit.** `git add web && git commit -m "feat(b): Overview, Warehouses and Replay & decision screens"`

---

### Task B11: Synthetic stock (SD-05) and weekly placement suggestions (W5)

**Files:**
- Create: `analytics/warehouse/stock.py`, `synthetic-data/generators/sd05_stock.py`
- Modify: `analytics/warehouse/__init__.py` (final version)
- Test: `analytics/tests/test_stock.py`, `api/test/routes/placement.test.ts`

**Interfaces:**
- Produces tables: `stock_daily` (43,164 rows, `synthetic = true`), `placement_suggestions`, `placement_impact`. `/api/placement` (B9) starts returning data.

- [ ] **Step 1: Write the failing tests** (AC-STK-01 to -03, AC-NFR-05):

```python
import pandas as pd

from analytics.warehouse import stock


def test_ac_stk_01_stock_matches_flags(d):
    daily = stock.stock_daily(d)
    keys = pd.DataFrame({"date": d.order_received_ts.dt.strftime("%Y-%m-%d"), "warehouse_id": d.nearest_warehouse_id,
                         "client_id": d.client_id, "sku": stock.assign_skus(d)})
    joined = keys.merge(daily, on=["date", "warehouse_id", "client_id", "sku"], how="left", validate="many_to_one")
    assert len(joined) == 48340
    assert ((joined.qty == 0).to_numpy() == d.nearest_warehouse_had_stock.eq("N").to_numpy()).all()
    assert daily.synthetic.all()


def test_ac_stk_02_suggests_move_to_high_demand_warehouse():
    merged = pd.DataFrame({"week": ["2026-09-07"] * 2, "client_id": ["C001"] * 2, "warehouse_id": ["W4", "W3"],
                           "orders": [70, 30], "qty": [20, 80]})
    out = stock.suggest(merged)
    assert len(out) == 1 and out.iloc[0].to_warehouse == "W4" and out.iloc[0].from_warehouse == "W3"


def test_nfr_05_stock_reproducible(d):
    pd.testing.assert_frame_equal(stock.stock_daily(d), stock.stock_daily(d))


def test_ac_stk_03_impact_labelled_synthetic(d):
    daily = stock.stock_daily(d)
    impact = stock.placement_impact(d, stock.placement_suggestions(d, daily))
    assert impact.synthetic.all() and (impact.avoided_next_week >= 0).all() and impact.avoided_next_week.sum() > 0
```

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool } from '../../src/core/db/pool.js';
import { buildApp } from '../../src/server.js';
import { hasDb } from '../db.js';

describe.skipIf(!hasDb)('placement route (needs test database)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(() => pool.end());
  const get = async (url: string) => (await app.inject({ method: 'GET', url })).json();

  it('placement is labelled synthetic', async () => {
    expect((await get('/api/placement')).synthetic).toBe(true);
  });
});
```

- [ ] **Step 2: Run.** `python -m pytest analytics/tests/test_stock.py` — Expected: FAIL, `ImportError: cannot import name 'stock'`.

- [ ] **Step 3: Implement** `analytics/warehouse/stock.py`:

```python
"""SD-05 synthetic stock and W5 weekly placement suggestions (SPEC §5.11).

Synthetic: generated from the supplied deliveries so the nearest warehouse is out of stock on exactly the deliveries
flagged nearest_warehouse_had_stock == 'N'. Never used by the replay.
"""
import numpy as np
import pandas as pd

SEED = 42
SKUS_PER_CLIENT = 3


def assign_skus(d: pd.DataFrame) -> pd.Series:
    """Out-of-stock deliveries use the client's first SKU; in-stock deliveries use the others.

    Keeps every (date, nearest warehouse, client, sku) key either all out of stock or all in stock.
    """
    num = d.client_id.str[1:].astype(int)
    rng = np.random.default_rng(SEED)
    other = 2 + rng.integers(0, SKUS_PER_CLIENT - 1, size=len(d))
    idx = np.where(d.f_stock_out, 1, other)
    return pd.Series([f"SKU-{n:03d}-{i}" for n, i in zip(num, idx)], index=d.index)


def stock_daily(d: pd.DataFrame) -> pd.DataFrame:
    """One row per (date, nearest warehouse, client, sku) seen in the deliveries: qty 0 when out of stock."""
    rng = np.random.default_rng(SEED)
    s = pd.DataFrame({
        "date": d.order_received_ts.dt.strftime("%Y-%m-%d"),
        "warehouse_id": d.nearest_warehouse_id,
        "client_id": d.client_id,
        "sku": assign_skus(d),
        "out": d.f_stock_out,
    })
    keys = s.groupby(["date", "warehouse_id", "client_id", "sku"]).out.max().reset_index()
    keys["qty"] = np.where(keys.out, 0, rng.integers(20, 100, size=len(keys)))
    keys["synthetic"] = True
    return keys.drop(columns="out")


def placement_suggestions(d: pd.DataFrame, stock: pd.DataFrame, threshold: float = 0.15) -> pd.DataFrame:
    """Per client and week: move stock towards the warehouses that serve most of the client's demand."""
    demand = d.assign(week=d.order_received_ts.dt.to_period("W").dt.start_time.dt.strftime("%Y-%m-%d"))
    demand = demand.groupby(["week", "client_id", "nearest_warehouse_id"]).size().rename("orders").reset_index()
    st = stock.assign(week=pd.to_datetime(stock.date).dt.to_period("W").dt.start_time.dt.strftime("%Y-%m-%d"))
    st = st.groupby(["week", "client_id", "warehouse_id"]).qty.sum().reset_index()
    merged = demand.rename(columns={"nearest_warehouse_id": "warehouse_id"}).merge(
        st, on=["week", "client_id", "warehouse_id"], how="outer").fillna({"orders": 0, "qty": 0})
    return suggest(merged, threshold)


def suggest(merged: pd.DataFrame, threshold: float = 0.15) -> pd.DataFrame:
    """merged columns: week, client_id, warehouse_id, orders, qty."""
    rows = []
    for (week, client), g in merged.groupby(["week", "client_id"]):
        if g.orders.sum() == 0 or g.qty.sum() == 0:
            continue
        g = g.assign(demand_share=g.orders / g.orders.sum(), stock_share=g.qty / g.qty.sum())
        g = g.assign(gap=g.demand_share - g.stock_share)
        short = g[g.gap > threshold].sort_values("gap", ascending=False)
        surplus = g[g.gap < 0].sort_values("gap")
        if short.empty or surplus.empty:
            continue
        to, frm = short.iloc[0], surplus.iloc[0]
        qty = int(round(min(to.gap, -frm.gap) * g.qty.sum()))
        if qty <= 0:
            continue
        rows.append({"week": week, "client_id": client, "sku": "all", "from_warehouse": frm.warehouse_id,
                     "to_warehouse": to.warehouse_id, "qty": qty,
                     "reason": f"{to.warehouse_id} serves {to.demand_share:.0%} of orders but holds "
                               f"{to.stock_share:.0%} of stock", "synthetic": True})
    return pd.DataFrame(rows, columns=["week", "client_id", "sku", "from_warehouse", "to_warehouse", "qty",
                                       "reason", "synthetic"])


def placement_impact(d: pd.DataFrame, suggestions: pd.DataFrame) -> pd.DataFrame:
    """For each week's suggestions: out-of-stock deliveries in the following week at the (client, to_warehouse)
    pairs the suggestions would have restocked. Synthetic-data metric (AC-STK-03)."""
    week = d.order_received_ts.dt.to_period("W").dt.start_time
    oos = d.loc[d.f_stock_out, ["client_id", "nearest_warehouse_id"]].assign(week=week[d.f_stock_out])
    rows = []
    for wk, g in suggestions.groupby("week"):
        nxt = pd.Timestamp(wk) + pd.Timedelta(days=7)
        pairs = set(zip(g.client_id, g.to_warehouse))
        nxt_oos = oos[oos.week.eq(nxt)]
        avoided = sum((c, w) in pairs for c, w in zip(nxt_oos.client_id, nxt_oos.nearest_warehouse_id))
        rows.append({"week": wk, "suggestions": len(g), "avoided_next_week": int(avoided), "synthetic": True})
    return pd.DataFrame(rows, columns=["week", "suggestions", "avoided_next_week", "synthetic"])
```

Replace `analytics/warehouse/__init__.py`:

```python
"""Warehouse pipeline step (owner B)."""
import pandas as pd

from analytics.core.context import Ctx
from analytics.warehouse import stock, tables


def build(ctx: Ctx) -> dict[str, pd.DataFrame]:
    d = ctx.d
    penalties = ctx.csv("sla_penalties.csv")
    daily = stock.stock_daily(d)
    suggestions = stock.placement_suggestions(d, daily)
    return {
        "warehouse_region_distance": tables.region_distance(ctx.csv("warehouse_region_distance_miles.csv")),
        "client_region_nearest": tables.client_region_nearest(d),
        "warehouse_stats": tables.warehouse_stats(d, ctx.csv("warehouses.csv")),
        "penalty_reconciliation": tables.penalty_reconciliation(d, penalties),
        "stock_daily": daily,
        "placement_suggestions": suggestions,
        "placement_impact": stock.placement_impact(d, suggestions),
    }
```

Generator script `synthetic-data/generators/sd05_stock.py`:

```python
"""SD-05: synthetic daily stock per warehouse x client x SKU (owner B). The pipeline builds the same table in memory.

Run from the repo root:  python synthetic-data/generators/sd05_stock.py
"""
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO))

from analytics.core.load import load  # noqa: E402
from analytics.warehouse.stock import stock_daily  # noqa: E402

OUT = REPO / "synthetic-data" / "out"

if __name__ == "__main__":
    d, _ = load()
    OUT.mkdir(parents=True, exist_ok=True)
    stock_daily(d).to_csv(OUT / "stock_daily.csv", index=False)
    print(f"wrote {OUT / 'stock_daily.csv'}")
```

- [ ] **Step 4: Run.** `python -m pytest && python synthetic-data/generators/sd05_stock.py && python -m analytics.pipeline --test-db && npm test -w api -- test/routes/placement` — Expected: all pass. The Warehouses screen now shows suggestions with the "Synthetic data" badge.

- [ ] **Step 5: Commit.** `git add analytics synthetic-data/generators && git commit -m "feat(b): synthetic stock (SD-05) and weekly placement suggestions (W5)"`

**Wednesday check-in:** Overview, Warehouses, Replay screens on live data; deployed by C.

---

### Task B12: Contract check and synthetic-data register (Thursday morning)

**Files:**
- Modify: `analytics/tests/test_pipeline.py` (final contract check)
- Create: `synthetic-data/README.md`

- [ ] **Step 1: Replace `analytics/tests/test_pipeline.py`** with the full contract check (fails if any area forgot a table from CONTRACTS §4):

```python
from analytics.pipeline import run

CONTRACT_TABLES = {
    "deliveries_clean", "clients", "carriers", "warehouses", "delivery_causes", "dq_report", "kpis", "cause_summary",
    "accounts", "scenario_results",
    "cause_attribution", "cause_kpis", "warehouse_region_distance", "client_region_nearest", "warehouse_stats",
    "penalty_reconciliation", "stock_daily", "placement_suggestions", "placement_impact", "lane_scores",
    "carrier_capacity", "carrier_backtest", "carrier_events", "complaints", "risk_lookup",
}


def test_pipeline_builds_every_contract_table():
    tables = run()
    assert set(tables) == CONTRACT_TABLES
    assert all(len(df) > 0 for df in tables.values())
    assert list(tables["delivery_causes"].columns)[:2] == ["delivery_id", "client_id"]
```

- [ ] **Step 2: Run.** `python -m pytest analytics/tests/test_pipeline.py` — Expected: PASS once A, B and C have all merged. A failure names the missing table: tell its owner.

- [ ] **Step 3: Write `synthetic-data/README.md`** — one section per SD-01 … SD-08 from SPEC §12.1 (built from, used by, generator command, what real data replaces it), plus the three rules (generated from supplied data, seeded, never in headline figures).

- [ ] **Step 4: Number check.** Open every screen and compare each figure with SPEC §2 (on-time 71.0%; programme 92.0% vs routing vendor 78.3%; as built 85.9% expected / 88.5% full fix; route only 73.6%; points lost 7.6 / 7.0 / 5.6 / 5.6 / 3.2; penalties $872,460; 2,002 unpaid; 2,414 second-pick orders). Any mismatch is a bug, not a copy-edit.

- [ ] **Step 5: Commit.** `git add analytics synthetic-data/README.md && git commit -m "test(b): full table contract check; synthetic data register"`

Then follow the overview plan §6 (submission).
