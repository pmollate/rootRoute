# root-route (LateLens)

Halcyon late-deliveries hackathon: diagnosis, recommendations and the Root Route landing page.

| Folder | What | Stack |
|---|---|---|
| `frontend/` | Landing page (scroll film); the deployable web app. See `frontend/README.md` | Next.js 15, React 19, GSAP, Lenis |
| `backend/` | `analytics/` (dataset loader, cause flags, pipeline), `api/` (Fastify API), `carrier-optimization-engine/` (carrier risk model, replay) | Python, pandas |
| `docs/` | Product + technical spec (`SPEC.md` is the source of truth), sub-specs, problem statement | — |
| `Halcyon-Hackathon-Dataset/` | Supplied synthetic dataset (read-only) | CSV |

## Quick start

```bash
npm run setup   # installs frontend dependencies (npm ci in frontend/)
npm run dev     # http://localhost:3000
npm run build   # production build of the frontend
```

Python (from the repo root):

```bash
python backend/carrier-optimization-engine/carrier_recommender_ml.py --data ./Halcyon-Hackathon-Dataset
```

## Run LateLens locally

Prerequisites: Docker Desktop, Node 22+, Python 3.12+.

```bash
cp .env.example .env
docker compose up -d                      # Postgres with databases latelens and latelens_test
python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
npm run setup                             # frontend and backend/api dependencies
npm run data                              # synthetic data (backend/synthetic-data/out)
npm run pipeline && npm run pipeline:test # computed tables -> latelens and latelens_test
npm run migrate && npm run migrate:test
npm run seed && npm run seed:test
npm run dev:all                           # API on :3001, landing page on :3000, dashboard on :3000/dashboard
```

Activate the venv (`source .venv/bin/activate`) in every new terminal; the `pipeline`, `data` and `test:py` scripts call `python`.
Tests: `npm test` (API, dashboard, Python; API route tests run only when the test database is up). Types: `npm run typecheck`.
Before pushing: `npm run setup` turns on a pre-push hook (`.githooks/pre-push`) that runs `scripts/check.sh` for the
areas the push changes: lint, typecheck and tests, plus the Playwright smoke test when the app is running
(`npm run dev:all`; install its browser once with `npx --prefix frontend playwright install chromium`). Run it by hand
with `npm run check`; skip it once with `git push --no-verify`.
Docs: `docs/SPEC.md` (what and why), `docs/CONTRACTS.md` (shared types, tables, API), `docs/superpowers/plans/` (task plans).

## Deploy

Deploy `frontend/` as the app root (Vercel: set Root Directory to `frontend`; Azure Static Web Apps: `app_location: frontend`).
