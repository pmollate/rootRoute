# privacy-compliance-auditor · personal data flows before real client data · 29 Oct 2026

**Asked by:** Priyank (via the lead agent) · **Branch / commit:** `agents-security-privacy` @ 79df1b6 (no changes made)
**Request:** Map where personal data enters, goes, stays and who sees it in LateLens, and check it against GDPR, US
privacy law (CCPA/CPRA, state breach laws, CAN-SPAM) and our own SEC-* rules, as if real client data were loaded next.

> **Not legal advice.** This is a compliance checklist for the team and for legal review. Applicability calls (which
> law covers which data, thresholds, contract status) need confirmation by Halcyon's counsel.

**Verdict:** Fine for the synthetic demo; **not ready for real client data**. Four High findings (unauthenticated API
reads of raw email, everyone-can-read raw email, unredacted complaint text to the model, model inputs stored and
processed globally) and the missing retention, DSR and contract documents must close first.

## What it did
- Read the agent definition, CLAUDE.md, SPEC §4, §5.3, §5.10, §5.14, §6–§8, §12, §12.1, `SPEC-auth.md` (SEC-AUTH-*),
  `SPEC-order-workflow.md` (SEC-JRN-*), CONTRACTS.md, the dataset README and DATA_DICTIONARY.
- Read code: `backend/api/src/core/{auth,permissions,config,recordings,gmail}.ts`, `core/pii/*`, `core/llm/azureOpenai.ts`,
  `core/maps/azureMaps.ts`, `modules/intake/{read,pipeline,repo,actions,routes,complaints,reply,mailbox,poll}.ts`,
  `prompts/extract.md`, `modules/carriers/journey.ts`, `modules/mcp/server.ts`, all 4 migrations, `server.ts`,
  `frontend/auth.ts`, `lib/auth/log.ts`, `IntakeScreen.tsx` storage, `infra/setup.sh`, `infra/setup-auth.sh`, `cd.yml`.
- Counts: 8 CSVs in the dataset (48,340 deliveries, 280 clients, 34 complaints, 18 time-study rows); 50 `.eml`
  fixtures, 0 without the SYNTHETIC label; 132 committed recordings, 51 of them PII-detector results; 25 routes in
  `permissions.ts`, 17 open to every role.
- Azure, read-only, names only (`az resource list`, `webapp config appsettings list --query [].name`,
  `cognitiveservices account list / deployment list`, `log-analytics workspace show`, App Insights component,
  `postgres flexible-server show`, `diagnostic-settings list`, `webapp log show`, `webapp show` access restrictions).
  No setting values, no Key Vault values, no `.env`, no mailbox, no database rows, no live HTTP probes.

## Data inventory (field names only)

Category: **CC** client contact (staff of client businesses), **ER** end recipient / delivery location, **ST** Halcyon
or LateLens staff, **—** none. Clients themselves are businesses (`client_name` is a company placeholder).

| Table / store | Personal fields | Category | Writer | Retention today |
|---|---|---|---|---|
| `intake_emails` | `from_addr`, `subject`, `body` (raw, unredacted), `pii_map` (tag → name/phone/email), `redacted_body` (keeps addresses), `thread_id`, `message_id` | CC, ER | Node | None (kept forever) |
| `intake_extractions` | `extraction.address.*`, `checks.address` (incl. saved-address candidates), `reply_draft` (tags, not names) | ER | Node | None |
| `outbound_messages` | `to_addr`, `body` (names restored) | CC, ER | Node | None |
| `saved_addresses` | `label`, `line1`, `line2`, `city`, `state`, `zip` (synthetic) | ER | Node seed | None |
| `client_domains` | `domain` (organisational) | — | Node seed | None |
| `inbound_orders` | `payload` (ship-to address) | ER | Node | None |
| `alerts` | `draft`, `payload` | CC/ER (possible) | Node | None |
| `complaints` | `text` (free text from client) | CC (possible) | Python | Reloaded by pipeline |
| `complaint_triage` | `draft` | CC (possible) | Node | None |
| `audit_log` | `actor` (user id), `payload.name`, `payload.roles` | ST | Node | None |
| `override_log` | `user_name` | ST | Node (Carriers) | None |
| `intake_polls` | `query`, `error` (external service messages) | — / possible ER | Node | None |
| Supplied `deliveries.csv` and derived tables | none (ids, regions, dates) | — | Python | — |
| `customer_success_time_study.csv` | `staff_id` + hours (employee productivity) | ST | not loaded by any code | — |
| Browser `localStorage` `rr.intake.draft.<id>`, `rr.intake.read` | edited reply text (names restored) | CC | Frontend | Until browser data cleared; survives sign-out |
| Auth.js JWT cookie | user id, name, roles | ST | Frontend | 8 h (`SESSION_HOURS`) |
| `backend/api/test/recordings/*.json` (git) | PII entity text (51 files, synthetic) | CC | `RECORD=1` | In git history forever |

## Flows

| Source → | Processor | Stored where | Region | Retention |
|---|---|---|---|---|
| Client email → Gmail demo inbox | Google (Gmail) | Gmail mailbox | Google | Mailbox policy (unknown) |
| Gmail → API (`gmail.readonly`, `insert`, `compose`) | LateLens API | `intake_emails` (raw body) | Central India | None |
| Raw text → PII detection (Person, PhoneNumber, Email) | Azure AI Language, `loggingOptOut: true` | not stored by service | North Central US (AIServices) — endpoint value not read | — |
| Redacted text (addresses kept) → extraction; facts → reply draft | Azure OpenAI `gpt-5-mini`, **GlobalStandard**, `store: true` | Foundry stored completions + abuse-monitoring | East US resource; GlobalStandard may process in any Azure region | ~30 days (stored completions); abuse monitoring up to 30 days unless exempted |
| Complaint `text` (**unredacted**) → triage draft | Azure OpenAI as above | stored completions; `complaint_triage` | as above | ~30 days / none |
| Delivery address (line1, city, state, ZIP) in URL query → geocode | Azure Maps | service logs | account not in RG (not checked) | Microsoft policy |
| Approved reply → client | Gmail send (allow-list, SEC-03) | `outbound_messages`, Gmail Sent | Google / Central India | None |
| API stdout (pino: emailId, decision, auth events with user id) | App Service → Log Analytics `rootroute01-logs` | `AppServiceConsoleLogs`, `AppServiceAppLogs` | Central India | 30 days (workspace); App Insights component 90 d setting |
| Web app HTTP logs (client IPs), auth logs (attempted email on failure) | App Service filesystem | web app file system | Central India | 7 days; web app has **no** diagnostic setting |
| DB backups | Azure Postgres Flexible | backups, SystemManaged key, geo-redundancy off | Central India | 7 days |
| CD Playwright report (screenshots of every screen) | GitHub Actions artefact | GitHub | GitHub | 7 days |
| MCP `/api/mcp` (6 read-only tools) | Claude client | — | — | No personal data in tool outputs (delivery facts, lanes, scenarios) |
| Order journey | API | — | — | SEC-JRN-01 holds: `journey.ts` returns no names, phones or emails |

## Which law applies to what (for legal to confirm)
- **CCPA/CPRA:** the main regime if Halcyon meets a threshold. B2B contact data and employee data have been in scope
  since 1 Jan 2023 (exemptions expired), so client contacts (CC), end-recipient addresses (ER) and staff (ST) are all
  covered. LateLens is a **service provider/contractor** to Halcyon (§1798.100(d), §1798.140(ag)). No sensitive PI is
  collected by design. Other state comprehensive laws (VA, CO, CT, TX, …) mostly exempt B2B and employee data.
- **State breach-notification laws** and CCPA §1798.150: their "personal information" is narrow (name + SSN, licence,
  financial account, credentials, health, etc.). Email bodies with name, phone and address are mostly **outside** it,
  unless an email carries such data. Keep it that way (minimisation) and treat a leak as reportable only after review.
- **GDPR:** applies only if Halcyon has an EU establishment or monitors/targets EU people; not expected for a US
  company with US addresses. Kept below as the baseline the brief asks for and because a client's EU staff may email.
- **India DPDP Act 2023:** all storage is in Central India; processing of digital personal data in India may bring it
  into scope. Legal to check, or move hosting to a US region (PC-07).
- **CAN-SPAM:** order replies, address queries and delay notices are transactional/relationship messages; only the
  rule against false or misleading header and sender information applies to them.
- **EU AI Act:** minimal risk. Extraction and reply drafting for B2B orders and complaint drafts are not Annex III uses
  (no employment, credit, essential-service or biometric decision), a person approves every send, and the system is
  not placed on the EU market. Art. 50 transparency is not triggered while a person reviews and sends each text.

## Findings (most severe first)

| Id | Sev. | Law / rule | Where | Gap | Fix |
|---|---|---|---|---|---|
| PC-01 | High (blocker for real data) | GDPR Art. 32, 5(1)(f), 25; CCPA §1798.100(e), §1798.81.5 (reasonable security); SEC-AUTH-07 | `backend/api/src/core/auth.ts:96-110` (off mode checks a key only on `legacyKey` routes); `core/permissions.ts:36` `GET /api/intake/:id`; `modules/intake/routes.ts:62-67`; `server.ts:28` (CORS `origin: true`); Azure `rootroute01-api`: no `AUTH_REQUIRED` setting (defaults off), access restriction "Allow all" | With auth off, any caller on the internet (and any website, via CORS) can read raw email bodies, sender addresses and name-restored reply drafts. Code-derived; not probed (network auditor's scope). | Ship C13: `AUTH_REQUIRED=on` on the API, App Service access restriction to the web app only (SEC-AUTH-07), CORS off (SEC-AUTH-13). Gate: no real data until this is on. |
| PC-02 | High | GDPR Art. 5(1)(c), 25(2), 32(4); CCPA §1798.100(c) (proportionate use) | `core/permissions.ts:36` (`READ` = every role, incl. leadership and carrier manager); `routes.ts:62-67` returns `body` and `restore()`d reply | Every signed-in role sees the unredacted email and contact names, though only the order desk needs them. | Return `redactedBody` by default; raw `body` and restored draft only to `order_desk`/`admin`; log raw views to `audit_log` with ref. |
| PC-03 | High | GDPR Art. 5(1)(c), 25(1); SPEC §5.3 step 4 principle ("nothing unredacted reaches the model") | `modules/intake/complaints.ts:71-79` | Complaint `text` goes to Azure OpenAI with no PII redaction (and no `tag`); real complaint emails will carry names and phones. | Run `redact()` on `row.text` before the call, `restore()` only on approval; add `tag: 'complaint'`; fail to template if PII is unreachable. |
| PC-04 | High | GDPR Art. 5(1)(c),(e), 28, 30, 44-46; CCPA §1798.100(a)(3) (retention disclosure), service-provider terms | `core/llm/azureOpenai.ts:26` (`store: true`, `metadata`); Azure `RootRoute` (East US) and `svodela-9340-resource` (North Central US): deployment `gpt-5-mini`, SKU **GlobalStandard** | Every prompt and completion (delivery addresses, complaint text) is kept ~30 days as a stored completion, outside any retention schedule, and GlobalStandard may process it in any Azure region. Abuse-monitoring retention status not visible. | `store: false` in production (keep it only for synthetic evals behind a flag); use a DataZone (US) or Standard regional deployment; apply for modified abuse monitoring or record the 30-day retention in the RoPA and notice. |
| PC-05 | Medium | GDPR Art. 5(1)(e), 17; CCPA §1798.100(a)(3), §1798.105 | `backend/db/migrations/100_intake.sql:20-58, 82-91`, `001_core.sql`, `300_carriers.sql:15-23`; no purge code anywhere | No table holding personal data has a retention limit or deletion job: raw bodies, `pii_map`, sent bodies, staff names in `audit_log.payload` and `override_log.user_name` stay forever. | Retention schedule (e.g. null `body` and `pii_map` 90 days after a final state; outbound bodies 1 year; audit 1-2 years), a scheduled purge, and the 7-day backup tail documented. |
| PC-06 | Medium | GDPR Art. 12, 15-17, 20; CCPA §1798.100, .105, .106, .110, .130 | No endpoint or script; copies in `intake_emails`, `pii_map`, `outbound_messages`, Gmail, Azure stored completions, browser storage | A request to know, correct or delete one person's data cannot be answered: nothing finds a person across tables and processors. | DSR procedure plus a script (`dsr --email/--name`) that exports and erases across tables and the Gmail thread, and the processor steps (stored completions, mailbox). |
| PC-07 | Medium | GDPR Art. 44-46 (if EU people); India DPDP Act s.3 (scope); client contracts | Azure: Postgres, App Service, Log Analytics, Key Vault in **Central India**; model in East US / global; Gmail at Google | US clients' data is stored in India and processed globally; not in any transfer record or notice. | Host production in a US region (or document the transfer, SCCs via the Microsoft DPA, and DPDP review); list every location in the RoPA. |
| PC-08 | Medium | GDPR Art. 28; CCPA §1798.100(d), §1798.140(ag) | `core/gmail.ts` and app setting `GMAIL_ACCOUNT` (demo inbox; account type not read); no Halcyon↔LateLens agreement in repo | Consumer Gmail has no data processing terms; no processor/service-provider contract exists between Halcyon and the LateLens team. | Real mail only through Halcyon's own Workspace or Microsoft 365 tenant (DPA in place); a processor/service-provider agreement with Halcyon; Azure under Halcyon's subscription and Microsoft DPA. |
| PC-09 | Medium | SEC-01; GDPR Art. 32 | Azure `rootroute01-api` app settings `AZURE_OPENAI_API_KEY`, `AZURE_LANGUAGE_KEY`, `AZURE_MAPS_KEY`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` are plain settings, not Key Vault references (the 4 others are) | The Gmail refresh token reads the whole mailbox; anyone with Contributor on the RG (incl. the GitHub OIDC principal) can read it. | Move these 5 to Key Vault references as `infra/setup.sh` does for `DATABASE_URL`; rotate after. |
| PC-10 | Medium | GDPR Art. 5(1)(c), 25 | `core/gmail.ts:8-10` (`gmail.readonly`, `gmail.insert`, `gmail.compose`) | Read scope covers every message in the account, and `insert` (fixture loading) is not needed in production. | A dedicated order mailbox only; production token without `gmail.insert`; document the scope in the RoPA. |
| PC-11 | Medium | GDPR Art. 5(1)(e),(f), 32 | `frontend/components/dashboard/intake/IntakeScreen.tsx:346-354`; `SignOutButton.tsx:8` | Edited replies with restored names stay in `localStorage` per email, indefinitely and after sign-out (shared desks). | Use `sessionStorage`, or clear `rr.intake.*` on sign-out and on send. |
| PC-12 | Medium | GDPR Art. 5(1)(b),(f), 25; SEC-05 | `core/recordings.ts:43-47`, `core/pii/recorded.ts:24-25`; 51 PII recordings tracked in git | `RECORD=1` writes detected names, phones and emails into files committed to the repo; on real data that is a leak into git history. | Refuse `RECORD=1` unless every input carries the SYNTHETIC label; CI check that recordings contain only fixture text. |
| PC-13 | Medium | GDPR Art. 13-14; CCPA §1798.100(a)-(b) notice at collection (incl. employees) | No notice anywhere | Client contacts, people named in emails, and staff whose ids and names are logged get no notice of collection, purposes, AI use, processors or retention. | Privacy notice for client contacts (link in reply signature) and a staff notice for audit logging; both list AI processing and retention. |
| PC-14 | Medium | GDPR Art. 35; CPPA risk-assessment regulations (check applicability) | Intake and complaint agents | AI reading customer email is the kind of processing a DPIA is expected for; none exists. | DPIA (inputs: this record, SPEC §5.3, §8, SPEC-auth threat model). |
| PC-15 | Low | GDPR Art. 5(1)(c),(e), 30; SEC-AUTH-06 | `server.ts:20` (Fastify default request log), `frontend/lib/auth/log.ts:5-6`, `frontend/auth.ts:47`; web app HTTP logs on, 7 d; web app has no diagnostic setting | Request logs carry IPs and URLs, failed sign-ins log the attempted email; web auth events never reach Log Analytics, so SEC-AUTH-06 is unmet and retention differs per store. | Add the web app diagnostic setting; set `trustProxy` and decide on IP truncation; list log stores and their 7/30-day retention in the RoPA. |
| PC-16 | Low | GDPR Art. 5(1)(c), 28 | `core/maps/azureMaps.ts:13-17`; `poll.ts:77-100` | Addresses go to Azure Maps in the URL query (may land in service logs), and external error text is stored in `intake_polls.error` and logs. | Accept and document (Microsoft DPA), or use the POST batch geocoder; truncate external error bodies before storing. |
| PC-17 | Low | SPEC §6 (`sent_by`), SEC-06, REQ-INT-12; GDPR Art. 22 | `100_intake.sql:50-58` (no `sent_by`); no `INTAKE_AUTO_REPLY` in code | SEC-06 auto-reply is not built, so today no reply leaves without an operator (Art. 22 not engaged). When it ships, it discloses saved addresses automatically and `outbound_messages` cannot say who sent. | Add `sent_by` before SEC-06; keep the DMARC check and allow-list; note auto-replies in the notice. |
| PC-18 | Low | SEC-02 | `complaints.ts:76-79` | The complaint prompt lacks the "untrusted data" instruction that `prompts/extract.md` has; output is only a draft and numbers are checked. | Wrap complaint text in tags with the same instruction. |
| PC-19 | Low | CAN-SPAM 15 U.S.C. §7704(a)(1) | `modules/intake/mailbox.ts:94-98`; signature "Halcyon Logistics" | Replies are signed Halcyon Logistics but sent from the demo Gmail account; in production the sender must clearly be Halcyon. | Send from Halcyon's own domain mailbox; keep headers truthful. |

What is already right (kept as evidence): PII removed before the extraction model and fail-closed (`read.ts`, `redact.ts:36-37`); unknown senders never reach PII or the model (`pipeline.ts:96-107`, REQ-INT-10); Azure Language `loggingOptOut: true`; extraction prompt treats email as untrusted data, no tools, zod schema (SEC-02); names restored only after approval (`actions.ts:77`); allow-list on every send (`mailbox.ts:102-105`, `actions.ts:71-75`, SEC-03); WMS entry needs approval (SEC-04); 50/50 fixtures labelled SYNTHETIC (SEC-05); journey shows no people (SEC-JRN-01); MCP tools return no personal data; reply drafting sees facts and tags only; time-study staff data is not loaded.

## Documents needed before real data

| Document | Status | Note |
|---|---|---|
| Privacy notice (client contacts) and staff notice | Missing | PC-13 |
| Record of processing (GDPR Art. 30) / CCPA data map | Partial | Inputs exist (SPEC §4.2 table owners, §12.1 register, this record); purposes, recipients, transfers and retention are not written down |
| DPIA (Art. 35) / risk assessment | Missing | PC-14 |
| Processor agreements: Halcyon ↔ LateLens team | Missing | PC-08 |
| Microsoft (Azure OpenAI, AI Language, Maps, Postgres, Monitor) DPA | Partial | Covered by the Microsoft Products and Services DPA for whichever subscription hosts it; production must run in Halcyon's |
| Google (Gmail) data processing terms | Missing | Consumer Gmail has none; use Workspace or M365 |
| Transfer assessment (India hosting, global model processing) | Missing | PC-07 |
| Retention schedule | Missing | Only implicit: logs 30 d, backups 7 d, HTTP logs 7 d, Playwright artefacts 7 d, stored completions ~30 d |
| Data-subject request procedure | Missing | PC-06 |
| Breach detection and response procedure | Missing | No alerting on unusual reads; App Insights and console logs exist |

## Could not check
- Which Azure OpenAI and AI Language resource the app uses (endpoint values not read), and whether modified abuse
  monitoring is approved (not visible in the CLI).
- Azure Maps account region and settings (not in `rg-unhandled-rejections`).
- Gmail account type (Workspace or consumer) and mailbox retention (`GMAIL_ACCOUNT` value not read; mailbox not opened).
- Whether the live API answers `GET /api/intake/:id` without credentials (no live probes; for the network-security
  auditor, whose record does not exist yet).
- Live row counts and contents of personal-data tables (needs `DATABASE_URL`, which is a secret).
- What App Insights auto-instrumentation (`ApplicationInsightsAgent_EXTENSION_VERSION`) captures beyond requests (no
  workspace query run).
- Halcyon's CCPA thresholds, EU presence and existing contracts (business facts, not in the data).

## Output
- This record. No code, SPEC or Azure changes.

## Handed to
- Carriers owner (C13): PC-01, PC-02, PC-09, PC-15 (auth on, access restriction, KV references, web diagnostics).
- Email owner (A): PC-03, PC-04, PC-10, PC-11, PC-12, PC-16 to PC-19.
- `network-security-auditor`: confirm PC-01 against the live API.
- `spec-writer`: add retention (PC-05) and DSR (PC-06) requirements and a §12 question on hosting region (PC-07).
- Team and Halcyon legal: PC-07, PC-08, PC-13, PC-14 and the documents table.
