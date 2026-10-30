# devops · pipeline and environments review · 2026-10-30

**Asked by:** team (scorecard 3.2 and 7.1 check before submission) · **Branch / commit:** `B28-devops-agent` from `main` @ `98e4f38`
**Request:** Read-only review of `ci.yml`, `cd.yml` and `infra/` against scorecard 7.1 ("deployed, or deployable with
IaC or CI/CD; environments and config separated"; Excellent: "fully automated pipeline that deploys from scratch,
repeatably"). Record findings with evidence; change nothing.

**Verdict:** Every push to `main` is tested, built, migrated, deployed, health-checked and end-to-end tested with no
manual step, and config is cleanly separated across local, CI and Azure. A from-scratch rebuild is two idempotent
scripts plus one manual GitHub settings step; `setup-auth.sh` is hardcoded to `rootroute01`, which is the main gap to
"deploys from scratch, repeatably".

## What it did
- Read `.github/workflows/ci.yml` (113 lines), `.github/workflows/cd.yml` (311 lines), `infra/setup.sh` (118),
  `infra/setup-auth.sh` (68), `docker-compose.yml`, `backend/db/init/01-test-db.sql`, `.env.example`, `.gitignore`,
  `.githooks/pre-push`, `scripts/check.sh`, root `package.json` scripts, README "Deploy", SPEC §9.3, and
  `backend/analytics/core/db.py` (to confirm the pipeline creates its own tables on an empty database).
- `grep` for every `uses:` line (all pinned, see below), for `NEXT_PUBLIC_API_KEY` / `NEXT_PUBLIC_API_URL` in
  `frontend/` (one server-side reference only: `frontend/app/api/[...path]/route.ts:19,22`) and for
  `ASK_ASSISTANT|CONFIRM_LINK|AUTH_REQUIRED` in `infra/` and `.github/` (no setting, only comments).
- `git tag`: no tags. `gh` is not installed here, so no Actions run history and no `demo` environment protection rules
  were read. No `az` command was run.

## Output

### How environments and config are separated
| Environment | Database | Secrets and config | Evidence |
|---|---|---|---|
| Local dev | Docker `postgres:16`, database `latelens` | gitignored `.env` copied from `.env.example` (safe defaults, empty keys, `LLM_PROVIDER=recorded`) | `docker-compose.yml:2-12`, `.env.example:1-3,7`, `.gitignore` (`.env`) |
| Local and CI tests | separate `latelens_test` database | `TEST_DATABASE_URL`; `pipeline:test`, `migrate:test`, `seed:test` target it | `backend/db/init/01-test-db.sql:2`, `.env.example:3`, `ci.yml:34,40-43,74-76` |
| CI | service container, throwaway credentials, `API_KEY: test-key`, recorded AI answers | nothing secret; `permissions: contents: read` | `ci.yml:9-10,28-43` |
| Azure (GitHub environment `demo`) | PostgreSQL Flexible Server `<name>-db` | Key Vault `<name>-kv` holds every secret; App Service reads them as Key Vault references with managed identity; GitHub signs in with OIDC | `setup.sh:18-41,68-87,89-108`, `setup-auth.sh:46-62`, `cd.yml:64-73,106-126` |

Names are parameterised in CD through `demo` environment variables (`vars.NAME`, `AZURE_RG`, optional overrides),
`cd.yml:79-83`, and checked before anything runs, `cd.yml:86-101`.

### Automated vs manual
- **Automated on every push to `main`:** CI (ruff, pytest, synthetic data reproducibility check, pipeline, migrations,
  seed, API and dashboard tests, typecheck, both production builds, gitleaks) → CD gate (only a green CI `push` run in
  this repo, and only if it is still the head of `main`, `cd.yml:28-57`) → OIDC login → per-run Postgres firewall rule
  (`cd.yml:127-142`, closed again at `167-170` and in an `always()` step at `252-254`) → data, pipeline, migrations,
  seed → package and deploy API and web with `clean: true` → app settings → restart → smoke check that waits for the
  new `GIT_SHA` from `/api/health` with `db: ok` and the new Next.js `BUILD_ID` in `/dashboard` (`cd.yml:237-251`)
  → Playwright e2e signed in with the demo password from Key Vault (`cd.yml:260-311`).
- **Automated but run by a person once:** `infra/setup.sh` creates Key Vault, generated secrets, Postgres, Log Analytics
  and App Insights, the App Service plan and both apps, managed identity and Key Vault references, the GitHub OIDC app
  and federated credential, and its role. Every step checks for the resource first (`setup.sh:12,19,36,39,44,47,56,58`),
  so it is safe to re-run. `infra/setup-auth.sh` does the same for sign-in secrets and keeps existing ones
  (`setup-auth.sh:34-44`).
- **Manual:** adding the three OIDC ids as `demo` secrets and `AZURE_RG`/`NAME` as variables
  (`setup.sh:110-118` prints them); the optional AI, Maps and Gmail secrets in the `demo` environment; feature switches
  (`ASK_ASSISTANT`, `CONFIRM_LINK`, `AUTH_REQUIRED`) are not set by any script or workflow.
- No Bicep/Terraform: infra is idempotent `az` CLI, as SPEC §9.3 decided ("Full Bicep is pitch only").

### Checked and fine
- Every action is pinned to a full commit SHA with its version as a comment: `actions/checkout` (`ci.yml:45,85,107`,
  `cd.yml:102,291`), `actions/setup-python` (`ci.yml:48`, `cd.yml:143`), `actions/setup-node` (`ci.yml:66,88`,
  `cd.yml:156,295`), `gitleaks/gitleaks-action` (`ci.yml:111`), `azure/login` (`cd.yml:106,275`),
  `azure/webapps-deploy` (`cd.yml:191,228`), `actions/upload-artifact` (`cd.yml:305`).
- Least privilege: workflow default `contents: read` (`ci.yml:9-10`, `cd.yml:18-19`); `id-token: write` only on the two
  jobs that log in to Azure (`cd.yml:73,268`); `persist-credentials: false` on every checkout.
- Secrets: gitleaks over full history on every PR and push (`ci.yml:100-113`); Key Vault values masked before they
  reach `GITHUB_ENV` (`cd.yml:121-126,284-290`); app settings passed through a `umask 077` temp file, not argv
  (`cd.yml:215-227`); no Azure password stored (OIDC, `setup.sh:89-108`); database password generated into Key Vault,
  never typed (`setup.sh:22-26`); `setup-auth.sh` writes secrets from a `chmod 700` temp dir with `--file`
  (`setup-auth.sh:16,42`).
- Safe deploys: one deployment at a time, never cancelled mid-migration (`cd.yml:67-70`); superseded commits skipped
  (`cd.yml:44-57`); CI on PRs cancels stale runs but CI on `main` always finishes (`ci.yml:12-15`).
- CI and production use the same Node (24) and Python (3.12) (`ci.yml:17-20`, `cd.yml:21-23`, `setup.sh:58`).
- The pipeline replaces its tables in one transaction (`backend/analytics/core/db.py:1,36-53`), so running it before
  migrations on an empty database (`cd.yml:155,164`) works.
- Local checks: `.githooks/pre-push` runs `scripts/check.sh` for changed areas, turned on by `npm run setup`.

### Findings (recommended changes; nothing was changed)
| Id | Severity | Where | What is wrong | Suggested change |
|---|---|---|---|---|
| DO-01 | medium | `infra/setup-auth.sh:8-13` | Resource names are hardcoded to `rootroute01` and `rg-unhandled-rejections`, unlike `setup.sh`, which takes `NAME`/`RG`. A second environment or a rebuild under a new name cannot run it unchanged. | Read `RG`, `NAME` the same way as `setup.sh:9` and derive `KV`, `WEB`, `API`. |
| DO-02 | medium | `infra/setup-auth.sh:12-13`, `setup.sh:112` | Both assume `<app>.azurewebsites.net`; `cd.yml:114-116` notes newer App Service apps get a unique host suffix. On a fresh environment `AUTH_URL` and `API_URL` would be wrong and sign-in would fail. | Look the host up with `az webapp show --query defaultHostName`, as `cd.yml` does. |
| DO-03 | medium | `cd.yml:196-227` vs `setup.sh:30-33,73-77` | AI keys have two sources: `setup.sh` stores them in Key Vault and sets Key Vault references, then CD overwrites the same app settings with plain values from GitHub secrets when those are set. Which one is live depends on which ran last. | Pick one: keep keys in Key Vault only and have CD set `@Microsoft.KeyVault(...)` references, or drop the Key Vault copy. |
| DO-04 | medium | SPEC §9.3 (`docs/SPEC.md:1215-1221`) | The spec describes Static Web Apps for the frontend, an `intake-eval.yml` workflow, and rollback by "redeploy the previous tag". The repo deploys to App Service, has no `intake-eval.yml` and no tags; `workflow_dispatch` deploys only the head of `main` (`cd.yml:34,47`). | Hand to `spec-writer` to match §9.3 to the workflows. For rollback, either tag releases and add a `ref` input to `cd.yml`, or document "revert on `main`, CD redeploys". |
| DO-05 | low | `infra/`, `cd.yml:196-227` | Feature switches `ASK_ASSISTANT`, `CONFIRM_LINK`, `AUTH_REQUIRED` (`.env.example:36,43,54`) are not set by any script or workflow, so their live values exist only in the portal. | Set them explicitly in `setup.sh` / `setup-auth.sh` (or from `demo` variables in CD) so a rebuild gets the same behaviour. |
| DO-06 | low | `setup.sh:106-107` | The GitHub service principal is Contributor on the whole resource group, more than CD needs (two web apps, Postgres firewall rules, read Key Vault). | Scope Contributor to the two apps and the Postgres server, or use Website Contributor plus a narrow custom role for firewall rules. |
| DO-07 | low | `cd.yml:179-183`, `frontend/app/api/[...path]/route.ts:22` | CD still bakes `API_KEY` in as `NEXT_PUBLIC_API_KEY` at build time ("ships to browsers by design"). Today only the server-side proxy reads it, and the web app already gets `API_KEY` as a Key Vault reference (`setup-auth.sh:60`). A future client-side reference would put the key in the browser bundle. | Remove `NEXT_PUBLIC_API_KEY` (and the fallback in `route.ts`, owned by the app team) now that the proxy uses `API_KEY`. |
| DO-08 | low | `.github/` | No Dependabot (or Renovate) config, so the pinned action SHAs and npm/pip dependencies are never proposed for update. No `npm audit` or CodeQL step in CI. | Add `.github/dependabot.yml` for `github-actions`, `npm` (`/frontend`, `/backend/api`) and `pip`. |
| DO-09 | low | `ci.yml:30`, `docker-compose.yml:3` | `postgres:16` is a moving tag, unlike the SHA-pinned actions. | Pin by digest (`postgres:16@sha256:…`) or at least a minor version. |
| DO-10 | low | `cd.yml:164,191-232` | Migrations run on the live database before the new code is deployed, with no backup step and no staging slot; a breaking migration takes the old code down, and `clean: true` deploys have a short outage. | Keep migrations backward compatible (documented rule), or take an `az postgres flexible-server backup` before `migrate`; a staging slot needs S1, not B1. |
| DO-11 | info | `.env.example:71-76` | Duplicate keys at the end of the file: `AZURE_MAPS_KEY` (also `:18`), `AZURE_OPENAI_DEPLOYMENT` (`:11`), and `AZURE_LANGUAGE_ENDPOINT` / `AZURE_LANGUAGE_KEY` twice (`:14-15`). The later empty values win in most dotenv loaders. | Delete lines 71-76. |
| DO-12 | info | `setup.sh:38` | Postgres `--public-access 0.0.0.0` admits any Azure-hosted client (any tenant) to try a login. The password is strong and generated, and CD's own access is a per-run rule. | Accept for the demo; for production use private networking (VNet integration) as `network-security-auditor` would report. |

### Scorecard 7.1 reading
Deployed and redeployed by CI/CD on every merge, with IaC-style idempotent scripts and separated config: meets
"Good" clearly. To claim "Excellent" (from scratch, repeatably), fix DO-01, DO-02 and DO-05 so that `setup.sh` →
`setup-auth.sh` → GitHub `demo` settings → push builds an identical second environment with no hand edits.

### Could not check
- GitHub Actions run history and the `demo` environment's protection rules and secrets list (`gh` not installed).
- Live Azure state (no `az` calls in this run; read-only probes are the `network-security-auditor`'s job).

## Handed to
- A person (owner C) to decide on DO-01 to DO-03 and DO-05 before submission; each is a small `infra/` or `cd.yml`
  change the `devops` agent can make on a branch when asked.
- `spec-writer` for DO-04 (SPEC §9.3 drift).
- App team (owner of `frontend/app/api/`) for the `route.ts` half of DO-07.
