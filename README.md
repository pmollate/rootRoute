# Root Route

Delivery diagnostics for logistics teams. Root Route traces every late delivery to its root cause — an incomplete
address, an order after the cut-off, a shipment from a farther warehouse, a weak carrier lane or a long route — and
gives each fix to the team that owns it. It shows what the data says and what each fix is worth; the business decides.

On the reference dataset (48,340 deliveries, 5 warehouses, 6 carriers, 280 clients) it finds a cause for every late
delivery, 67% of them before pickup. Replaying those deliveries with the fixes this build delivers lifts on-time from
**71.0% to 85.9%** at expected adoption (88.5% if every fix worked every time) and avoids about **$708K** of penalties
and handling in 6 months; the full programme reaches 92.0%. Before/after and method: [`docs/IMPACT.md`](docs/IMPACT.md).

**Live app:** <https://rootroute.in> (landing page) and <https://rootroute.in/dashboard>; the App Service address
<https://rootroute01-web.azurewebsites.net> serves the same app. Sign in with a demo account
`demo-<role>@rootroute.test` (roles below); the demo password is shared with the jury separately, never in the repo.
API health: <https://rootroute01-api.azurewebsites.net/api/health>.

https://evokemail.sharepoint.com/:v:/r/sites/LearningandDevelopmentTeam2/_layouts/15/stream.aspx?id=%2Fsites%2FLearningandDevelopmentTeam2%2FShared%20Documents%2FHackathon%202026%2FProblem%20Statement%202%2FUnhandled%20Rejections%2Frootroute%2Dpitch%2Dfast%2Emp4&share=cQqIiaqYTfwsQox4IaI9LWzAEgUC5w4JT6KfnHmIHvVOUtfKYw


## What it does

| Screen | What it shows | Who sees it |
|---|---|---|
| Landing page `/` | The product, public (no sign-in) | Everyone |
| Overview | On-time rate, the five causes ranked by on-time points lost, what each fix is worth | All roles |
| Order emails | AI-read email orders with flagged gaps, drafted client replies, approve / reject / send to WMS; Tier 1 clients' threads in a collapsible section at the top | Order desk, warehouse supervisor |
| Address link `/confirm/<token>` | One-time page a client opens from a reply: an emailed code, then the address on a map | The client (no sign-in; the link and code are the credentials) |
| Warehouses | Cut-off misses, orders from a non-nearest warehouse, unpaid penalties, weekly stock moves | Warehouse supervisor, leadership |
| Carriers | Lane scorecards on fair data, capacity days, a recommended carrier with override | Carrier manager, leadership |
| Complaints | Each complaint linked to its delivery and triaged by cause | Customer support |
| Order journey | One delivery from email to doorstep, stage by stage; new email orders are listed once per conversation (a client's answer joins its order) | All roles |
| Labs (Replay) | Past deliveries replayed with each fix on, by segment | Warehouse supervisor, carrier manager, leadership |

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
npm run bench                             # optional: timed 1x / 10x / second-client run, no DB write (docs/SCALE-RUN.md)
```

**Verified on a fresh clone** (30 Oct 2026, commit `812155d`, macOS arm64, Node 22, Python 3.14): the steps above,
unchanged, took 2 min 35 s with no manual step, and `npm test` passed 740 of 740
([run record](docs/agent-runs/2026-10-30-clean-clone.md)).

Activate the venv in every new terminal; `pipeline`, `data` and `test:py` call `python`. One `.env` at the repo root
serves every script (`.env.example` lists each setting).

**Environments.** `development`, `test` and `production` each have their own non-secret settings in
[`config/environments/`](config/environments/); `APP_ENV` picks one (tests pick `test` by themselves). Your `.env`
holds secrets and local overrides. Production reads Key Vault through App Service settings. Details and the order in
which settings win: [`docs/ARCHITECTURE.md` §4](docs/ARCHITECTURE.md#4-hosting-and-deploy).

## Sample input

Root Route reads three kinds of input. All of it is in the repo or generated from it; nothing needs a live system.

**1. The supplied dataset** in `Halcyon-Hackathon-Dataset/` (read-only; columns in `DATA_DICTIONARY.md`).
`npm run pipeline` reads it and writes the computed tables.

| File | Rows | What |
|---|---|---|
| `deliveries.csv` | 48,340 | One row per delivery: order, handling, warehouse, carrier, outcome |
| `clients.csv` | 280 | One row per client |
| `carriers.csv` | 6 | The six carriers |
| `warehouses.csv` | 5 | The five warehouses |
| `warehouse_region_distance_miles.csv` | 5 | Miles from each warehouse to each region |
| `sla_penalties.csv` | 4,847 | Service-level penalty payments |
| `complaints.csv` | 34 | Client complaints, last 90 days |
| `customer_success_time_study.csv` | 18 | One week of hours for the customer success team |

```text
delivery_id,order_id,client_id,order_channel,email_format_id,order_received_ts,commitment_type,promised_date,address_status,pick_list_date,shipped_ts,destination_region,nearest_warehouse_id,fulfilment_warehouse_id,nearest_warehouse_had_stock,distance_miles,carrier_id,carrier_rate_usd,stops_on_route,planned_route_km,actual_route_km,delivered_date,days_late,on_time,redelivery_cost_usd
D000001,ORD-35519966,C170,API,,2026-04-01 00:00,standard,2026-04-05,complete,2026-04-01,2026-04-01 13:00,Northeast,W4,W4,Y,104,D,12.30,10,71.7,74.4,2026-04-05,0,Y,0
```

**2. Order emails** (synthetic) in `backend/tests/fixtures/emails/`: 50 emails (`NN.eml`), each with the expected
answer (`NN.json`: items, address, decision). Two to start with:

| File | Client | What the app should do |
|---|---|---|
| `01.eml` | C003, Detroit, full address | `ALL_CLEAR`: order goes to review for approval |
| `09.eml` | C067, Orlando with a Philadelphia ZIP (19107) | `CONFIRM_ADDRESS`: drafts a reply asking the client to confirm |

Fixtures with no ZIP at all: `14.eml`, `27.eml`, `33.eml`.

**3. Synthetic data** from `npm run data` in `backend/synthetic-data/out/` (gitignored): client email domains, saved
addresses, stock, carrier capacity, tracking events and complaint emails. It fills gaps in the supplied set, is
labelled synthetic on every screen, and never feeds the headline figures. Register: `backend/synthetic-data/README.md`.

### Try one email

1. Run the app (`npm run dev:all`) after `npm run seed`, which loads the client domains the intake checks senders against.
2. Open `http://localhost:3000/dashboard/intake` (roles `order_desk`, `warehouse_supervisor`, `admin`).
3. Click **Paste an email**. Fill From, Subject and Received at (`YYYY-MM-DD HH:MM`) from the `.eml` header, paste the
   text below the blank line as the body, and click **Process email**.

Or call the API directly (with `AUTH_REQUIRED=off`):

```bash
curl -s localhost:3001/api/intake/email -H 'content-type: application/json' -H 'x-api-key: dev-key' -d '{
  "from": "orders@client003.example", "subject": "[SYNTHETIC] Order 01", "receivedAt": "2026-10-20 16:36",
  "body": "PURCHASE ORDER\nDelivery: same day\nShip to:\n2 Woodward Ave\nDock 5\nDetroit, MI 48226\nItems:\n- HX-989 x 56\n- HX-293 x 101\nThanks,\nDana Whitfield\n(313) 555-0104\ndana.whitfield@client003.example\n\n-- SYNTHETIC test email, not a real order --"
}'
```

With `LLM_PROVIDER=recorded` (the default) the model answers come from `backend/api/test/recordings/`, which hold the
50 fixtures. Any other text has no recording and the email waits (`WAITING`) until a model is set
(`LLM_PROVIDER=azure-openai`). To run all 50 fixtures against their expected answers:
`npm --prefix backend/api run eval:intake` (add ids to run a few, e.g. `-- 01 09`). It prints the exact score; with the
recorded answers: fields 245/245, incomplete addresses caught 10/10, decisions 49/50.

To send the fixtures to a running API, as the paste form does, and see each decision and how long it took:
`npm run send:fixtures` (all 50) or `npm run send:fixtures -- 01 09 34`. It reads `API_URL` and `API_KEY` from the shell
or `.env` and needs `AUTH_REQUIRED=off`. It prints one row per email (id, expected decision, decision, status, seconds;
`*` marks a decision that differs from the fixture's) and a p50 / p95 / max line. With recorded answers 49 of 50 match:
fixture 03, the prompt-injection email, is refused by the model's content filter and becomes `MISSING_INFO` (still
never `ALL_CLEAR`).

### Try your own email

Paste any order into the form, or change the `curl` body above. The sender's domain must belong to a client
(`client001.example` … `client280.example`, loaded by `npm run seed`); anything else is "Unknown sender",
`MISSING_INFO`, with no AI call. Text that is not one of the 50 fixtures has no recording, so with
`LLM_PROVIDER=recorded` it waits (`WAITING`); set `LLM_PROVIDER=azure-openai` (and the PII and Maps providers) to have
it read. Keep it synthetic: no real names or addresses of real people.

### Bad inputs to try

Each is refused before anything is stored or any AI service is called, with one readable sentence in `error` and the
message per field in `fields` (REQ-INT-16, AC-INT-16 to -18). The paste form shows the sentence next to the form.

| Input | Answer |
|---|---|
| Body empty or only spaces / newlines | 400 `The email body is empty.` (the form keeps **Process email** disabled) |
| `from` left out; `body` left out | 400 `From is missing.` / `The email body is missing.` (every missing field is named) |
| `"from": "orders"` | 400 `From must be an email address, like orders@client190.example.` |
| `"receivedAt": "20/10/2026 9:30"` or `"2026-02-30 08:05"` | 400 `Received at must look like 2026-09-14 09:30 (a real date, 24-hour time).` |
| Body over `INTAKE_MAX_BODY_CHARS` (20,000), subject over `INTAKE_MAX_SUBJECT_CHARS` (300) | 400 `The email body is longer than 20,000 characters.` (the form shows the count and the limit) |
| Request over 1 MB | 413 `The request is larger than 1 MB. Paste only the text of one email.` |
| Broken JSON (`{"from":`), or an empty request | 400 `The request is not valid JSON.` |
| `Content-Type: application/x-www-form-urlencoded` | 415 `Send the request as JSON (Content-Type: application/json).` |
| A JSON array or plain text | 400 `Send the email as a JSON object with from, subject, body and receivedAt.` |

```bash
curl -s localhost:3001/api/intake/email -H 'content-type: application/json' -H 'x-api-key: dev-key' \
  -d '{"from": "orders", "receivedAt": "20/10/2026 9:30", "body": "   "}'
```

Screenshots of the paste form and the API's answers for each case: [`docs/TEST-EVIDENCE.md`](docs/TEST-EVIDENCE.md#bad-input-screenshots-and-logs).

### Address link (E19)

When an order's address is incomplete or the map disagrees with it (street not found, or another city, state or ZIP),
the order is `CONFIRM_ADDRESS`. The reply names what is wrong and asks for the full, correct address; it never lists
the client's saved addresses. With `CONFIRM_LINK=on` it also carries a one-time link, made when an operator clicks
**Request address**.

1. **Check your inbox.** The link opens on the masked sender (`v••••••••@gmail.com`) and **Send code**. The code
   (6 digits, 10 minutes) goes to the address the order came from; nothing about the address shows yet.
2. **Confirm the delivery address.** After the code: the email's address in the fields and a map with a pin. Dragging
   or tapping the pin fills street, city, state and ZIP from the map; zoom and recenter are on the map. On Confirm
   the server looks the address up again; if the map disagrees, the page shows **Your address** and **Suggested
   address** (read-only) and asks to confirm again.
3. The order is decided again (usually `ALL_CLEAR`) and waits in **Order review** marked "Address confirmed by client
   link", with the acceptance reply drafted: it repeats the address the client confirmed ("We will deliver to the
   address you confirmed: …"). Nothing reaches the WMS and no reply is sent until a supervisor approves (SEC-04);
   approval saves the address for the client.

| Setting | Default | Effect |
|---|---|---|
| `CONFIRM_LINK` | `off` | `on`: replies carry the link and `/confirm/*` opens (read by both apps) |
| `CONFIRM_LINK_CODE` | `on` | The emailed code before the address page; `off` opens the address form directly (API only) |
| `AUTH_URL` | — | The web app's origin; the link is `<AUTH_URL>/confirm/<token>`. The API will not start with `CONFIRM_LINK=on` without it |
| `CONFIRM_LINK_HOURS` | `24` | Link life; it also ends 2 hours before the order's 08:00 cut-off, whichever is sooner |
| `CONFIRM_LINK_RATE_PER_MINUTE` | `30` | Requests per minute per client IP to `/confirm/*` and `/api/confirm/*` (each pin move is one) |
| `ADDRESS_PROVIDER`, `AZURE_MAPS_KEY` | `recorded` | `azure-maps` checks addresses live with the key (server only) |
| `AZURE_MAPS_ACCOUNT_ID`, `AZURE_MAPS_SAS_PRINCIPAL_ID` | — | Map tiles in the browser: a SAS token from the Maps account, issued per link and expiring with it |

**Try it locally.** It needs Gmail set up (`GMAIL_*`) and the client's address on `ALLOW_LIST`. A Gmail sender is a
client only once registered by full address in `client_emails` (`backend/synthetic-data/out/client_emails.csv`, or
`INSERT INTO client_emails VALUES ('you@gmail.com', 'C130')` locally; never a whole shared domain). Then:

1. In `.env`: `CONFIRM_LINK=on`, `AUTH_URL=http://localhost:3000`, `ADDRESS_PROVIDER=azure-maps`, and restart
   `npm run dev:all` (the API reads `.env` only at start). `npm run migrate` adds the link tables (103, 105).
2. Email an order with a wrong city from that address, e.g. `HX-790 x 15` / `HX-618 x 9` /
   `Deliver to 65156 Powers Rd, Madhapur, OR 97828`. (Gmail messages are told apart by their Gmail id; the paste form
   treats the same sender and body as the same email, so change the text when pasting again.)
3. **Sync Gmail**, open it (Confirm address), click **Request address**, open the link from your inbox, **Send code**,
   enter the code, fix the city (or tap the map) and **Confirm address**. Each link and code works once.

The map tiles need the SAS identity: a user-assigned managed identity attached to the Maps account with the Azure Maps
Data Reader role (assigning a role needs Owner, User Access Administrator or Role Based Access Control Administrator on
the resource group). Without it the page hides the map and the fields still work. In Azure:

- Azure Maps is not offered in `centralindia`: create the account with `-l eastus` (any of westus2, eastus,
  westeurope, northeurope, westcentralus).
- Attach the identity through the 2023-06-01 API; `az maps account update` may not take or show it:
  `az rest --method patch --url "https://management.azure.com<account id>?api-version=2023-06-01" --body
  '{"identity":{"type":"UserAssigned","userAssignedIdentities":{"<identity id>":{}}}}'`. Check with `az rest --method
  get` on the same URL (`identity.type` is `UserAssigned`); `az maps account show` reports `identity: null` either way.
- The API's managed identity calls `listSas`: Azure Maps Contributor on the account (Contributor on the group also works).

Security in short: the token is 32 random bytes and only its SHA-256 is stored; the code and the verification token are
stored only as hashes and never logged; the token never appears in logs (`/confirm/[token]`); the pages are light only,
`no-referrer` and cannot be framed; at most 20 map look-ups per link. Full rules and threat model: `docs/SPEC.md` §5.17.

## Test

```bash
npm test            # API, frontend and Python tests (API route tests need the test database)
npm run typecheck   # frontend types and API lint
npm run check       # what the pre-push hook runs: lint, types and tests for the areas changed
```

`npm test` runs the Python suite with `python`, so activate the venv first (`source .venv/bin/activate`); without it,
the run stops at `test:py` with `python: command not found`. The API route tests need Postgres up and the test
database migrated, piped and seeded (the `:test` commands in [Run locally](#run-locally)).

## Change the cause rules

The five cause rules (08:00 cut-off, 20% route overrun, carrier D's Friday cap, the bad carrier × region lanes) and the
adoption rates behind the replay live in [`backend/analytics/rules.json`](backend/analytics/rules.json), not in code.
Edit it, or point `ANALYTICS_RULES` at another client's file, and rerun `npm run pipeline`. The golden tests in
`backend/analytics/tests/test_scenarios.py` hold the supplied data's figures, so they fail on purpose when the default
rules change. The API's order-time cut-off (`CUTOFF_HOUR` in `backend/api/src/modules/warehouse/domain.ts`) is checked
against the same file by `backend/api/test/warehouse/domain.test.ts`.

`npm run setup` turns on the pre-push hook (`.githooks/pre-push`). With the app running it also runs the Playwright
smoke test; install its browser once with `npx --prefix frontend playwright install chromium`. Skip the hook once with
`git push --no-verify`.

## Troubleshooting

| Problem | Fix |
|---|---|
| API or pipeline fails with `ECONNREFUSED ...:5432` (or `connection refused`) | Postgres is not running: `docker compose up -d` (Docker Desktop must be open) |
| `database "latelens_test" does not exist`, or API route tests are skipped (`needs test database`) | The test database is made only when the Docker volume is first created (`backend/db/init/01-test-db.sql`). Recreate it: `docker compose down -v && docker compose up -d`, then rerun `migrate`, `pipeline` and `seed` with and without `:test` |
| `ModuleNotFoundError: No module named 'pandas'`, or `python: command not found` | The venv is not active in this terminal: `source .venv/bin/activate` (once: `pip install -r requirements.txt`) |
| Dashboard screens are empty or the API logs `relation ... does not exist` | Tables are missing: `npm run migrate && npm run pipeline && npm run seed` |
| `npm run seed` fails with `ENOENT ... client_domains.csv` | Synthetic data is not generated yet: `npm run data`, then `npm run seed` |
| A pasted email shows "Unknown sender" | The sender's domain is not seeded. Use a fixture sender (`orders@clientNNN.example`) and run `npm run seed` |
| A pasted email stays `WAITING` | No recorded model answer for that text with `LLM_PROVIDER=recorded`. Paste a fixture exactly, or set the `AZURE_OPENAI_*` settings and `LLM_PROVIDER=azure-openai` |
| An email sent from Gmail does not show in the inbox | Click **Sync Gmail**; the inbox is sorted by priority, so search by subject. A sender that is not a client is "Unknown sender" (see [Address link](#address-link-e19) for registering a Gmail address) |
| A **Confirm address** reply has no link (no `[CONFIRM_LINK]` in the draft) | `CONFIRM_LINK` was off when the email was read: turn it on, restart `npm run dev:all`, and send a new email (old drafts are not redrafted) |
| The address link says "This link is no longer valid" | The link was used, expired, replaced by a newer link, or the order was already confirmed through another of its links. Request a new one from a new order email |
| "Too many tries from this connection" on the address page | More than `CONFIRM_LINK_RATE_PER_MINUTE` requests from one IP in a minute. Wait a minute |
| The address page's map is blank or hidden | The map tile credential is refused: the SAS identity or its Azure Maps Data Reader role is missing (see [Address link](#address-link-e19)). The fields and Confirm still work |
| Lost the demo password | It is printed once and only its hash is stored. Delete the `AUTH_DEMO_USERS=` line in `.env`, run `npm run demo-users` for a new one, and restart `npm run dev` |
| No email/password form on `/login`, or demo sign-in refused | Set `AUTH_DEMO=on` and a filled `AUTH_DEMO_USERS` in `.env` (`npm run demo-users`), then restart `npm run dev` |
| Web app will not start with `AUTH_REQUIRED=on` | It needs `AUTH_SECRET` and an `INTERNAL_AUTH_SECRET` of 32+ bytes. `npm run demo-users` fills both; or set `AUTH_REQUIRED=off` locally |
| `EADDRINUSE` on port 3001, or the web app starts on 3001/3002 | An old dev server still holds the port (Next.js moves to the next free port when 3000 is taken). Find it with `lsof -i :3000` (or `:3001`) and stop it. The API port is `PORT` in `.env`; if you move it, set `API_URL` to match |
| Dashboard loses its styles after `npm run build` | `next build` and `next dev` share `frontend/.next`. Stop `npm run dev`, delete `frontend/.next`, start it again. Do not build while dev runs |
| `git push` blocked by the pre-push hook | Read the `✗` lines and fix them. `dependencies are missing or out of date` means run `npm run setup`. Skip once with `git push --no-verify` |
| Playwright: `Executable doesn't exist` | Install the browser once: `npx --prefix frontend playwright install chromium`. The smoke test runs only with the app up (`npm run dev:all`); set `E2E_DEMO_PASSWORD` to run it signed in |

## Deploy

Azure, region Central India: two Linux App Service apps on one B1 plan (`<name>-web` for Next.js, `<name>-api` for
Fastify), PostgreSQL Flexible Server and Key Vault for every secret.

1. `NAME=rootroute01 GITHUB_REPO=<owner>/<repo> ./infra/setup.sh` creates the resources once.
2. `bash infra/setup-auth.sh` writes the sign-in secrets and demo accounts to Key Vault.
3. Every push to `main` runs CI (`.github/workflows/ci.yml`), then CD (`.github/workflows/cd.yml`), which builds both
   apps, runs migrations and the pipeline against Azure Postgres, deploys, and runs the end-to-end tests.

The address link is off in Azure until it is set up: CD does not yet pass `CONFIRM_LINK`, `CONFIRM_LINK_CODE`,
`AZURE_MAPS_ACCOUNT_ID` or `AZURE_MAPS_SAS_PRINCIPAL_ID`. To turn it on, add them to both apps' settings (with
`AUTH_URL` on the API), give the API's managed identity permission to call `listSas` on the Maps account, and attach
the SAS identity with the Azure Maps Data Reader role.

## Documents

**Demo video** (SharePoint): [DEMO_VIDEO_URL]. The demo script is `docs/SPEC.md` §11.

| Document | What |
|---|---|
| [`docs/DISCOVERY.md`](docs/DISCOVERY.md) | One page: problem, baseline, users and pain points, sponsor input, requirements and scope |
| [`docs/IMPACT.md`](docs/IMPACT.md) | Before vs after on Halcyon's KPIs, and what is new, each with a before/after comparison |
| [`docs/TRACEABILITY.md`](docs/TRACEABILITY.md) | Feature → requirement → acceptance criterion → test (generated: `python3 scripts/traceability.py`) |
| [`docs/SPEC.md`](docs/SPEC.md) | Source of truth. Discovery: problem and recommendation §1, evidence §2, scope §3, assumptions and open questions §12, discovery log §14.1 |
| [`docs/CONTRACTS.md`](docs/CONTRACTS.md) | Shared types, tables, API routes and settings |
| [`docs/SPEC-auth.md`](docs/SPEC-auth.md) | Sign-in, roles and permissions |
| [`docs/SPEC-data-upload.md`](docs/SPEC-data-upload.md) | Data store, source connection and analysis by date window |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | How the parts fit together; [decision log](docs/ARCHITECTURE.md#5-decision-log) (§5: each choice, the alternative and the trade-off) |
| [`docs/SCALE-RUN.md`](docs/SCALE-RUN.md) | Timed pipeline run at 1×, 10× and on a second client (`npm run bench`) |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | What comes next |
| [`docs/TEST-EVIDENCE.md`](docs/TEST-EVIDENCE.md) | Test results and evidence |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Secrets scan result, where credentials live, roles and Azure least privilege |
| [`Halcyon-Hackathon-Dataset/DATA_DICTIONARY.md`](Halcyon-Hackathon-Dataset/DATA_DICTIONARY.md) | Columns of the supplied dataset |
| [`backend/synthetic-data/README.md`](backend/synthetic-data/README.md) | Synthetic data register |

Agents in how we build (`.claude/agents/`, run records in [`docs/agent-runs/`](docs/agent-runs/)):

| Role | Agent |
|---|---|
| Dev | [`implementer`](.claude/agents/implementer.md) |
| QA | [`qa-evidence`](.claude/agents/qa-evidence.md) |
| DevOps | [`devops`](.claude/agents/devops.md) |
| Spec, plan, review | [`spec-writer`](.claude/agents/spec-writer.md), [`planner`](.claude/agents/planner.md), [`reviewer`](.claude/agents/reviewer.md) |
