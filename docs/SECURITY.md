# Security: secrets scan, credentials and access

How Root Route keeps secrets out of the repo, where credentials live, who can do what, and what is still too broad.
Authentication design in full: [`SPEC-auth.md`](SPEC-auth.md). Threat model: SPEC-auth §6 and SPEC §5.17. Findings of
the last audit: [`agent-runs/2026-10-29-network-security-auditor.md`](agent-runs/2026-10-29-network-security-auditor.md).

## 1. Secrets scan

| Scan | Scope | Result |
|---|---|---|
| gitleaks 8.28.0, `git` mode, 30 Oct 2026 | All history of `main` (168 commits, 13.5 MB) | **No leaks found** |
| gitleaks, `git` mode, every branch | 181 commits incl. unmerged branches | 9 findings, all on the unmerged branch `wms-simulator-live`: fixed test values in `tools/wms-simulator/config.test.mjs` and throwaway localhost tokens in a plan's smoke-test command. Not on `main`; to be reviewed before that branch merges |
| gitleaks, working tree | Files in git | Only the 3 checked placeholders listed in `.gitleaksignore` (a `<strong password>` example and two localhost test tokens) |
| CI (`.github/workflows/ci.yml`, job `secrets`) | Every push and pull request | Same gitleaks CLI over all reachable history; a finding fails the build (AC-SEC-01) |

Repeat it:

```bash
docker run --rm -v "$PWD:/repo" ghcr.io/gitleaks/gitleaks:v8.28.0 git /repo --redact --log-opts="origin/main"
```

Local only and gitignored: `.env` (real local keys), `frontend/.next/` build output. The pre-push hook
(`.githooks/pre-push`, installed by `npm run setup`) runs the tests for the areas a push changes; the secrets scan
itself runs in CI.

## 2. Where credentials live

| Credential | Local | Azure |
|---|---|---|
| Postgres connection string | `.env` (`DATABASE_URL`) | Key Vault secret, read by the API through a Key Vault reference |
| Azure OpenAI, Language, Maps keys | `.env` | Key Vault references |
| Sign-in secrets (`AUTH_SECRET`, `INTERNAL_AUTH_SECRET`, Entra client secret) | `.env`, filled by `npm run demo-users` | Key Vault, written by `infra/setup-auth.sh` |
| Demo account passwords | Only a hash in `AUTH_DEMO_USERS`; the password is printed once | Hash in Key Vault; CD reads the e2e password from Key Vault |
| Azure access from CD | — | GitHub OIDC federated credential; no stored Azure password in GitHub |

`.env.example` holds names and safe defaults only.

## 3. Who can do what (application)

- Sign-in: Microsoft Entra ID (single tenant), or demo accounts when `AUTH_DEMO=on`. Sessions are cookies; the web app
  calls the API with a 60-second signed internal token (SPEC-auth §5.1, §5.2).
- Six roles, default deny. Pages: `PAGE_ROLES` in `frontend/lib/auth/roles.ts`; API: `backend/api/src/core/permissions.ts`,
  where every route must be listed or it is refused (tested, AC-AUTH-06). Each role sees only its own workspace plus
  Overview and Order journey (SPEC-auth §4.4); `leadership` is read-only.
- Model safety: the AI model never decides or acts. Code makes every order decision, an operator approves before the
  WMS, outbound email goes only to the allow-list, and the assistant's tools are read-only (SPEC §8).
- Login abuse: unknown email and wrong password give the same answer; the 6th failure from one IP in a minute is refused.

## 4. Who can do what (Azure), and least privilege

| Identity | Permission | Scope | Least privilege? |
|---|---|---|---|
| API app (`<name>-api`), managed identity | Key Vault secrets: get, list | One vault | Yes: read only, no keys or certificates |
| Web app (`<name>-web`), managed identity | Key Vault secrets: get, list | One vault | Yes |
| CD (GitHub OIDC service principal) | Contributor; Key Vault secrets: get, list | The team resource group | **Broader than needed.** It deploys two web apps and runs migrations; a custom role (web app deploy + app settings) would do |
| Federated credential subject | `repo:<owner>/<repo>:environment:copilot` | One repo, one environment | Yes: other branches or forks cannot get a token |
| Person running `infra/setup.sh` | Key Vault secrets: get, list, set | One vault | Needed to write secrets once |
| Postgres | The API connects as the server admin user, TLS required (`sslmode=require`), firewall admits Azure services only | Server | **Broader than needed.** A separate app role with rights on the app schema only, and VNet or private endpoint access, are on the roadmap |
| Web apps | HTTPS only | Both apps | Yes |

Key Vault uses the access-policy model (`--enable-rbac-authorization false` in `infra/setup.sh`). Each identity gets
only secret get/list, but access policies cannot be scoped below the whole vault, and the vault has public network
access with purge protection off (audit finding NS-08). Next steps: Key Vault RBAC with "Key Vault Secrets User" per
identity, purge protection on, and network rules.

## 5. Known gaps

The two rows marked "broader than needed" above, and automatic replies to spoofed or automatic senders (SEC-06), which
are not built: every reply waits for an operator. Plan: [`ROADMAP.md`](ROADMAP.md).
