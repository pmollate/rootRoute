# Root Route

Delivery diagnostics for logistics teams. Root Route traces every late delivery to its root cause — an incomplete
address, an order after the cut-off, a shipment from a farther warehouse, a weak carrier lane or a long route — and
gives each fix to the team that owns it. It shows what the data says and what each fix is worth; the business decides.

On the reference dataset (48,340 deliveries, 5 warehouses, 6 carriers, 280 clients) it finds a cause for every late
delivery, 67% of them before pickup, and a replay with every fix switched on lifts on-time from 71.0% to 88.5%.
Figures and how they are computed: `docs/SPEC.md` §2 and §5.8.

## What it does

| Screen | What it shows | Who sees it |
|---|---|---|
| Landing page `/` | The product, public (no sign-in) | Everyone |
| Overview | On-time rate, the five causes ranked by on-time points lost, what each fix is worth | All roles |
| Order emails | AI-read email orders with flagged gaps, drafted client replies, approve / reject / send to WMS | Order desk, warehouse supervisor |
| Warehouses | Cut-off misses, orders from a non-nearest warehouse, unpaid penalties, weekly stock moves | Warehouse supervisor, leadership |
| Carriers | Lane scorecards on fair data, capacity days, a recommended carrier with override | Carrier manager, leadership |
| Complaints | Each complaint linked to its delivery and triaged by cause | Customer support |
| Order journey | One delivery from email to doorstep, stage by stage | All roles |
| Replay | Past deliveries replayed with each fix on, by segment | Warehouse supervisor, carrier manager, leadership |

Admin sees everything. AI only reads emails and drafts replies; a person approves every order before it reaches the
WMS, and outbound email goes only to an allow-list (`docs/SPEC.md` §8).

### Roles and sign-in

Six roles: `order_desk`, `warehouse_supervisor`, `carrier_manager`, `customer_support`, `leadership` (read-only) and
`admin`. The page matrix is `PAGE_ROLES` in `frontend/lib/auth/roles.ts`; the API enforces the same rules in
`backend/api/src/core/permissions.ts` (default deny). Sign-in is Microsoft Entra ID, or demo accounts
(`demo-<role>@rootroute.test`) when `AUTH_DEMO=on`. Full design: `docs/SPEC-auth.md`.

| Setting | Effect |
|---|---|
| `AUTH_REQUIRED=on` | Every page except `/`, `/login`, `/no-access` needs a session; the API needs a signed internal token |
| `AUTH_REQUIRED=off` (default) | No redirects; keyed API routes accept `x-api-key` as before |
| `AUTH_DEMO=on` | Shows the email/password form for the demo accounts in `AUTH_DEMO_USERS` |
| `MAINTENANCE_MODE=true` | Every page serves the maintenance page (503) |

## Repo layout

| Folder | What | Stack |
|---|---|---|
| `frontend/` | Landing page at `/` (scroll film) and the dashboard at `/dashboard/*`. See `frontend/README.md` | Next.js 15, React 19, Auth.js, GSAP, Lenis |
| `backend/api/` | API and agents: email intake, rules, recommendations, MCP endpoint | Node, Fastify |
| `backend/analytics/` | Dataset loader, the five cause flags, replay; writes the computed tables | Python, pandas |
| `backend/db/migrations/` | SQL migrations (1xx email, 2xx warehouse, 3xx carriers) | PostgreSQL |
| `backend/synthetic-data/` | Seeded generators for data the supplied set lacks (labelled synthetic) | Python |
| `backend/carrier-optimization-engine/` | Carrier risk model | Python, LightGBM |
| `infra/` | Azure setup scripts | Azure CLI |
| `docs/` | `SPEC.md` (source of truth), `CONTRACTS.md`, sub-specs, task plans | — |
| `Halcyon-Hackathon-Dataset/` | Supplied dataset (read-only) | CSV |

## Run locally

Prerequisites: Docker Desktop, Node 22+, Python 3.12+.

```bash
cp .env.example .env
docker compose up -d                      # Postgres with databases latelens and latelens_test
python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
npm run setup                             # dependencies, git hooks, and demo accounts (prints the demo password once)
npm run data                              # synthetic data (backend/synthetic-data/out)
npm run pipeline && npm run pipeline:test # computed tables -> latelens and latelens_test
npm run migrate && npm run migrate:test
npm run seed && npm run seed:test
npm run dev:all                           # API on :3001, web on :3000 (landing page) and :3000/dashboard
```

Activate the venv in every new terminal; `pipeline`, `data` and `test:py` call `python`. One `.env` at the repo root
serves every script (`.env.example` lists each setting).

## Test

```bash
npm test            # API, frontend and Python tests (API route tests need the test database)
npm run typecheck   # frontend types and API lint
npm run check       # what the pre-push hook runs: lint, types and tests for the areas changed
```

`npm run setup` turns on the pre-push hook (`.githooks/pre-push`). With the app running it also runs the Playwright
smoke test; install its browser once with `npx --prefix frontend playwright install chromium`. Skip the hook once with
`git push --no-verify`.

## Deploy

Azure, region Central India: two Linux App Service apps on one B1 plan (`<name>-web` for Next.js, `<name>-api` for
Fastify), PostgreSQL Flexible Server and Key Vault for every secret.

1. `NAME=rootroute01 GITHUB_REPO=<owner>/<repo> ./infra/setup.sh` creates the resources once.
2. `bash infra/setup-auth.sh` writes the sign-in secrets and demo accounts to Key Vault.
3. Every push to `main` runs CI (`.github/workflows/ci.yml`), then CD (`.github/workflows/cd.yml`), which builds both
   apps, runs migrations and the pipeline against Azure Postgres, deploys, and runs the end-to-end tests.
