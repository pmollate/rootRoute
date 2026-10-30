# Clean-clone setup run, 30 Oct 2026

Followed README "Run locally" step by step on a fresh `git clone` of `labs-replay-role-home` at `812155d`, into an
empty folder: no `node_modules`, no `.venv`, no `.env`, no generated synthetic data. Script:
`git clone` → `cp .env.example .env` → `python3 -m venv .venv && pip install -r requirements.txt` → `npm run setup` →
`npm run data` → `npm run pipeline && npm run pipeline:test` → `npm run migrate && npm run migrate:test` →
`npm run seed && npm run seed:test` → `npm test` → `npm run typecheck`.

Machine: Apple silicon Mac (arm64), macOS 27.2, Node 22.22.0, Python 3.14.4, Docker 29.9.2.

| Step | Result | Time |
|---|---|---|
| clone, `.env` from `.env.example` | ok | 0 s |
| venv + `pip install -r requirements.txt` | ok | 10 s |
| `npm run setup` (both `npm ci`, hooks, demo accounts) | ok | 23 s |
| `npm run data` | ok | 6 s |
| pipeline (both databases) | ok | 65 s |
| migrate (both databases) | ok | 1 s |
| seed (both databases) | ok | 2 s |
| `npm test` | ok: API 502/502, dashboard 137/137, pytest 96/96, simulator 5/5 | 44 s |
| `npm run typecheck` | ok | 4 s |

Total: 2 min 35 s, no manual step and no edit to any file.

**Not covered:** the run reused this machine's Node, Python and the Postgres container already running from
`docker compose up -d` (a second compose project would clash on port 5432), so it proves the repo and README are
complete, not that a machine without those tools works. `npm run dev:all` was not started from the clone (the
running app on ports 3000/3001 holds them).
