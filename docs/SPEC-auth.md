# SPEC — Sign-in and roles ("Login", P7)

**Project:** LateLens (root-route) · **Version:** 0.1 · **Status:** draft for team review, build after code submission
**Date:** 29 Oct 2026 · **Parent spec:** `docs/SPEC.md` v0.9 (source of truth; this file adds P7 and changes SEC-JRN-02)
**Owner:** Carriers + deploy (Task C13) · **Touches:** every screen and every API route (Email, Warehouse, Carriers)

**Conventions** as in SPEC: **MUST** / **SHOULD** / **MAY** per RFC 2119; every requirement has an id (`REQ-AUTH-NN`,
`NFR-AUTH-NN`, `SEC-AUTH-NN`), its acceptance criterion has the same number (`AC-AUTH-NN`); every **MUST** has an AC.

---

## 1. Context and problem

LateLens has no users. Today:
- Every screen and every `GET /api/*` route is open to anyone with the URL.
- Write routes check one shared key in `x-api-key` (`backend/api/src/core/auth.ts`), but the browser sends it as
  `NEXT_PUBLIC_API_KEY`, so the key ships in the JavaScript bundle and anyone can approve an order or send a reply.
- `POST /api/complaints/:id/triage` and `POST /api/recommend` write rows with no key at all.
- The person who acted is whatever the browser claims: the Order emails desk sends `user: 'ops'`, the Carriers
  override form takes a typed "Full name". Approvals (SEC-04) and overrides cannot be traced to a person.

The agent workflow puts a human gate at every agent (approve order, stock shortfall, lane override, send notice). A gate
is only as good as knowing **who** passed it and that they were **allowed** to.

## 2. Decisions (agreed 29 Oct 2026)

| Question | Decision |
|---|---|
| Identity provider | **Microsoft Entra ID** (single tenant) for real users, plus **demo accounts** for local dev, Playwright and judges |
| Roles | **One per agent gate**: order desk, warehouse supervisor, carrier manager, customer support, leadership (read-only), admin |
| What is public | **Nothing.** Every page, including the landing page, and every API route except health and MCP needs sign-in |
| When | Spec on 29 Oct; build on a branch **after** the code submission, so the submitted demo is not at risk |

## 3. Goal and success measure

Every person using LateLens signs in, sees what their role allows, and every approval, send, override and triage is
recorded with the signed-in person's id, enforced by the API, not just hidden in the UI.

**Success:** with the browser bundle and dev tools in hand, an unsigned visitor can read nothing and change nothing;
a leadership user can read every screen and change nothing; each row in `intake_emails`, `override_log` and
`audit_log` written after go-live names a real user id.

## 4. Roles

| Role id | Who (Halcyon brief) | Can read | Can do |
|---|---|---|---|
| `order_desk` | Customer success staff who key email orders | All screens | Fetch and process emails, approve orders, send replies (Order agent gate) |
| `warehouse_supervisor` | Warehouse supervisors (5 sites) | All screens | Send approved orders to the WMS (SEC-04), stock decisions (Warehouse agent gate) |
| `carrier_manager` | Carrier management, procurement | All screens | Carrier recommendations, lane overrides (Carrier agent gate) |
| `customer_support` | Customer success / VP Customer Success | All screens | Complaint triage, run and send delay notices (Delivery and Support agent gates) |
| `leadership` | COO, CFO | All screens | Nothing (read-only) |
| `admin` | The LateLens team | All screens | Everything above |

A user **MAY** hold several roles. A signed-in user with no LateLens role sees a "No access yet" page and nothing else.

### 4.1 Route permissions

| Route | Allowed roles |
|---|---|
| `GET /api/health` | Public (App Service health check) |
| `POST /api/mcp` | MCP bearer token only (REQ-MCP-02, unchanged) |
| Every other `GET /api/*` | Any LateLens role |
| `POST /api/intake/email`, `POST /api/intake/fetch` | `order_desk`, `admin` |
| `POST /api/intake/:id/action` with `approve` or `send_reply` | `order_desk`, `admin` |
| `POST /api/intake/:id/action` with `send_to_wms` | `warehouse_supervisor`, `admin` (see open question Q-AUTH-03) |
| `POST /api/recommend`, `POST /api/overrides` | `carrier_manager`, `admin` |
| `POST /api/complaints/:id/triage`, `POST /api/alerts/run` | `customer_support`, `admin` |
| Any route added later | **Denied** until it is listed here (REQ-AUTH-06) |

## 5. Design

### 5.1 Request flow (backend-for-frontend)

```
Browser ──cookie──► Next.js (rootroute01-web) ──Bearer internal JWT──► Fastify API (rootroute01-api) ──► Postgres
   │                  │ middleware: no session → /login
   │                  │ /api/auth/*      Auth.js (Entra ID, demo accounts)
   │                  │ /api/[...path]   proxy: checks session, signs a 60 s token {sub, name, roles}
   └── never sees an API key or the API host
```

- **Auth.js v5** in the Next app handles sign-in and holds the session in an encrypted, `httpOnly`, `Secure`,
  `SameSite=Lax` cookie.
- The browser calls **same-origin** `/api/...` paths. A Next route handler `app/api/[...path]/route.ts` forwards each
  call to `API_URL` with `Authorization: Bearer <internal token>`.
- The **internal token** is an HS256 JWT signed with `INTERNAL_AUTH_SECRET` (`iss: latelens-web`,
  `aud: latelens-api`, `exp`: 60 s, claims `sub`, `name`, `roles`). Demo users and Entra users get the same token, so
  the API has one check.
- The API replaces `requireApiKey` with `requireUser(roles)`, verified with `jose`. The actor id written to the
  database comes **only** from the token; the `user` field in request bodies is removed.
- `NEXT_PUBLIC_API_KEY` and `NEXT_PUBLIC_API_URL` are removed from the browser bundle. `API_KEY` is retired once every
  caller uses the internal token.

### 5.2 Entra ID

- One app registration, `rootroute01-web`, single tenant, redirect URIs for the live app and `http://localhost:3000`.
- App roles with the ids in §4. "Assignment required" is on, so only assigned users and groups can sign in.
- Roles come from the ID token's `roles` claim; nothing is stored in our database about Entra users except the
  `sub` (object id) and display name written next to their actions.

### 5.3 Demo accounts

- An Auth.js Credentials provider, on only when `AUTH_DEMO=on`.
- Accounts come from the Key Vault secret `auth-demo-users` (JSON: email, display name, roles, bcrypt hash); one per
  role, named `demo-<role>@latelens.test`. Passwords are never committed and never shown on a page.
- Every screen shows a "Demo account" badge while a demo user is signed in.
- Judges and Playwright use these accounts; the passwords go in the submission notes and the GitHub Actions secret
  `E2E_DEMO_PASSWORD`, not in the repo.

### 5.4 Screens

- `/login`: "Sign in with Microsoft" button; the demo form below it when `AUTH_DEMO=on`; a clear error on failure
  that never says whether the email exists.
- Header: user name, role badges, "Sign out".
- `/no-access`: for signed-in users with no LateLens role.
- Action buttons a user's role cannot use are hidden; the API still refuses them (REQ-AUTH-05).
- The Carriers override form drops its "Full name" field; the Order emails desk drops `user: 'ops'`.

## 6. Requirements

### 6.1 Functional

| Id | Requirement |
|---|---|
| REQ-AUTH-01 | Every page except `/login`, `/no-access`, `/maintenance` and Auth.js routes **MUST** redirect a visitor without a session to `/login`, keeping the requested path as the return address. |
| REQ-AUTH-02 | Users **MUST** be able to sign in with Microsoft Entra ID (single tenant) and, when `AUTH_DEMO=on`, with a demo account. |
| REQ-AUTH-03 | Roles **MUST** come from Entra app roles (or the demo account's roles); a user with none **MUST** see only `/no-access`. |
| REQ-AUTH-04 | Every API route except `GET /api/health` and `POST /api/mcp` **MUST** refuse a request without a valid internal token (401). |
| REQ-AUTH-05 | Every write route **MUST** check the role in §4.1 and refuse others (403), whatever the UI shows. |
| REQ-AUTH-06 | A route not listed in §4.1 **MUST** be denied by default (a test fails if a route has no permission entry). |
| REQ-AUTH-07 | The actor recorded for an approval, send, WMS entry, override or triage **MUST** be the token's `sub` and name; a `user` field in the request body **MUST** be ignored. |
| REQ-AUTH-08 | Users **MUST** be able to sign out; signing out ends the session cookie. |
| REQ-AUTH-09 | The header **SHOULD** show the user's name and roles, and a "Demo account" badge for demo users. |
| REQ-AUTH-10 | Buttons a user's role cannot use **SHOULD** be hidden. |

### 6.2 Non-functional

| Id | Requirement |
|---|---|
| NFR-AUTH-01 | The proxy **SHOULD** add no more than 50 ms at p95 to an API call (same region). |
| NFR-AUTH-02 | A session **MUST** expire after 8 hours; it **SHOULD** be refreshed while in use. |
| NFR-AUTH-03 | Local dev **MUST** work without Entra, using demo accounts (`AUTH_DEMO=on` in `.env`). |

### 6.3 Security

| Id | Requirement |
|---|---|
| SEC-AUTH-01 | No API key, secret or API host **MUST** reach the browser bundle (`NEXT_PUBLIC_` holds none). |
| SEC-AUTH-02 | `AUTH_SECRET`, `INTERNAL_AUTH_SECRET` (≥ 32 bytes), the Entra client secret and `auth-demo-users` **MUST** live in Key Vault or the gitignored `.env` (SEC-01). |
| SEC-AUTH-03 | Internal tokens **MUST** expire within 60 s and be checked for `iss`, `aud` and signature. |
| SEC-AUTH-04 | The proxy **MUST** refuse a state-changing request whose `Origin` is not the app's own (CSRF). |
| SEC-AUTH-05 | Demo sign-in **MUST** be limited to 5 failed attempts per IP per minute, and **MUST** be off unless `AUTH_DEMO=on`. |
| SEC-AUTH-06 | Sign-in, sign-out, failed sign-in and 403 refusals **MUST** be logged with the user id (never a password or token), so they appear in Application Insights (NFR-03). |
| SEC-AUTH-07 | The API **SHOULD** accept traffic only from the web app (App Service access restrictions) as a second line of defence. |

**Change to `docs/SPEC-order-workflow.md`:** SEC-JRN-02 ("dashboard reads need no API key") is replaced by REQ-AUTH-04:
journey reads need a signed-in user. SEC-JRN-01 (no people's details in the journey) still holds.

## 7. Acceptance criteria

| Id | Criterion |
|---|---|
| AC-AUTH-01 | Given no session, when `/`, `/dashboard` or `/dashboard/journey?ref=delivery:D000213` is opened, then the browser lands on `/login` and, after signing in, returns to the page asked for. |
| AC-AUTH-02 | Given `AUTH_DEMO=on`, when `demo-leadership@latelens.test` signs in with the right password, then the dashboard opens; with a wrong password, then a generic error shows. Given `AUTH_DEMO` unset, then the demo form is absent and its endpoint refuses. |
| AC-AUTH-03 | Given an Entra user with no app role, when they sign in, then they see `/no-access` and every API call returns 403. |
| AC-AUTH-04 | Given no token, an expired token, or a token signed with another secret, when any route other than health and MCP is called, then the API returns 401. |
| AC-AUTH-05 | Given a `leadership` token, when `POST /api/intake/:id/action` (`approve`) or `POST /api/overrides` is called, then 403 and no row changes; given `order_desk`, the approve succeeds and `send_to_wms` returns 403. |
| AC-AUTH-06 | Given the list of registered routes, when the permissions test runs, then every route has an entry in the §4.1 table. |
| AC-AUTH-07 | Given an `order_desk` user `u1` approving with body `user: "someone-else"`, then the stored actor is `u1`. |
| AC-AUTH-08 | Given a signed-in user, when they sign out, then the next page load goes to `/login`. |
| AC-NFR-AUTH-02 | Given a session cookie older than 8 hours, when a page loads, then the browser lands on `/login`. |
| AC-NFR-AUTH-03 | Given a fresh clone with `.env.example` copied, when `npm run dev:all` runs, then a demo user can sign in without Entra settings. |
| AC-SEC-AUTH-01 | Given the production build, when `.next/static` is searched for the API key, the API host and `INTERNAL_AUTH_SECRET`, then none is found. |
| AC-SEC-AUTH-02 | Given the repo, when the CI secret scan runs, then no auth secrets or password hashes are found. |
| AC-SEC-AUTH-03 | Given a token with the wrong `aud` or `iss`, then 401. |
| AC-SEC-AUTH-04 | Given a POST through the proxy with `Origin: https://evil.example`, then 403 and the API is not called. |
| AC-SEC-AUTH-05 | Given 6 wrong demo passwords from one IP within a minute, then the 6th is refused without checking the password. |
| AC-SEC-AUTH-06 | Given a failed sign-in and a 403, when Application Insights is queried, then both lines appear with the user id and no password or token. |

## 8. Configuration

| Name | Where | Notes |
|---|---|---|
| `AUTH_SECRET` | Web app, Key Vault `auth-secret` | Auth.js cookie encryption |
| `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET`, `AUTH_MICROSOFT_ENTRA_ID_ISSUER` | Web app, Key Vault | From the `rootroute01-web` app registration |
| `INTERNAL_AUTH_SECRET` | Web app and API, Key Vault `internal-auth-secret` | Signs and verifies the internal token |
| `AUTH_REQUIRED` | Web app and API | `off` (default) logs refusals but lets requests through; `on` enforces (§11) |
| `AUTH_DEMO` | Web app | `on` locally and for the judged demo; off otherwise |
| `AUTH_DEMO_USERS` | Web app, Key Vault `auth-demo-users` | JSON with bcrypt hashes |
| `E2E_DEMO_PASSWORD` | GitHub Actions secret | Playwright sign-in in the CD `e2e` job |
| Removed | — | `NEXT_PUBLIC_API_KEY`, `NEXT_PUBLIC_API_URL`; `API_KEY` after the switch |

## 9. Out of scope

- Self-service sign-up, password reset and MFA for demo accounts (Entra handles MFA for real users).
- A user-management screen; roles are assigned in Entra.
- Client (customer) logins and a client portal.
- Row-level limits (e.g. a supervisor seeing only their own warehouse); every role reads all data.
- Changing MCP authentication (REQ-MCP-02 stays a bearer token).

## 10. Risks

| Risk | Mitigation |
|---|---|
| The Evoke tenant does not allow us to create an app registration | Demo accounts cover the demo; Entra goes live when an admin registers the app (Q-AUTH-01) |
| Moving every fetch behind the proxy breaks a screen | One proxy route, not per-screen changes; Playwright workflow tests run signed in before merge |
| "Nothing public" hides the landing page from judges | Demo `leadership` account in the submission notes; the login page names the product |
| A new route ships without a permission entry | REQ-AUTH-06 test fails the build |
| Shared demo passwords leak | Demo accounts are read-only except one per role on synthetic data; rotate `auth-demo-users` after judging |

## 11. Rollout

1. Merge behind `AUTH_REQUIRED=off` (default): proxy and tokens live, nothing refused yet; Playwright still green.
2. Create Key Vault secrets and app settings (confirm before creating Azure resources); seed demo accounts.
3. Turn `AUTH_REQUIRED=on` locally, run the workflow e2e signed in, then on the live app.
4. Remove `NEXT_PUBLIC_API_KEY` and `API_KEY`; rotate the old key.

**Rollback:** set `AUTH_REQUIRED=off` and restart both apps; the shared key path is kept until step 4.

## 12. Open questions

| Id | Question | Ask |
|---|---|---|
| Q-AUTH-01 | Can we register an app in the Evoke Entra tenant, or do we need an admin? | Azure admin |
| Q-AUTH-02 | Who assigns roles to real users after go-live? | Team / Halcyon ops lead |
| Q-AUTH-03 | Is `send_to_wms` a warehouse supervisor's action, or the order desk's after supervisor review (E18)? | Email (A) and Warehouse (B) owners |
| Q-AUTH-04 | Should judges get one `admin` demo account or one per role? | Team |
