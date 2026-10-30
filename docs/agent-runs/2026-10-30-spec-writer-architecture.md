# spec-writer · architecture and decision log · 2026-10-30

**Asked by:** team (jury scorecard 3.3 "Architecture & design choices") · **Branch / commit:** `B29-architecture-and-decision-log`
**Request:** Write an architecture diagram, tech stack, hosting summary and a decision log with alternatives and
trade-offs, drawn from what the repo actually contains.

## What it did
- Read CLAUDE.md, SPEC §4, §5.1, §5.2, §5.3, §5.5, §5.14, §5.16, §8, §9.3, §14.1 and the "Changes in v0.x" notes,
  `SPEC-auth.md` §2 and §5, `SPEC-data-upload.md` §2–§3, `ci.yml`, `cd.yml`, `infra/setup.sh`, `docker-compose.yml`.
- Checked every diagram box against code: `frontend/middleware.ts`, `frontend/auth.ts`, `frontend/app/api/[...path]/route.ts`,
  `backend/api/src/server.ts`, `core/{auth,permissions,modules,cache,config}.ts`, `core/llm/index.ts`, the five modules
  (intake, warehouse, carriers, assistant, mcp), `backend/analytics/pipeline.py`, `core/db.py`, migrations, package files.
- Found two places where SPEC §4.1 differs from the code: the web app runs on App Service (`next start`), not Static
  Web Apps, and Node is 24 in CI/CD/App Service, not 22. ARCHITECTURE.md follows the code and says so; §4.1 left as is
  (another agent is editing SPEC).
- Dropped `INTAKE_AUTO_REPLY` from the flags decision: it is specified (SEC-06) but not in `core/config.ts`.

## Output
- New `docs/ARCHITECTURE.md`: runtime Mermaid diagram, data-flow diagram with the one-writer table, tech stack table
  with versions from package files, hosting and CI/CD summary, decision log of 15 entries, 5 known limits linking
  `SPEC-data-upload.md`.
- `docs/SPEC.md` §4: one pointer line to `docs/ARCHITECTURE.md`. No version bump (one-line pointer, no requirement
  changed).
- No new or changed REQ/AC ids; no figures added beyond those already in the docs.

## Handed to
- Spec owner: update SPEC §4.1 hosting row (Static Web Apps → App Service) and Node version (22 → 24) in the next SPEC pass.
- README owner: link `docs/ARCHITECTURE.md` from the README.
