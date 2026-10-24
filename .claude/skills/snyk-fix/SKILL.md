---
name: snyk-fix
description: >
  Fix Snyk vulnerabilities using the Snyk Portal (app.snyk.io) as the source of truth.
  Pulls issues via the Snyk REST API, shows a severity summary, fixes what it can,
  and reports what it cannot. Stops before committing so the human can review.
  Trigger: "fix snyk issues for <package>", "/snyk-fix <package>".
allowed-tools: Read, Grep, Glob, Bash
---

# Snyk Portal Fix — Spec

Execute all steps in the main thread (no subagents). Use Bash, Read, Grep, Glob
for discovery; Edit/Write for file changes (require user approval).

## Input

```
/snyk-fix <package-name>
```

- Match argument (case-insensitive) against Snyk **target** display names in the org.
- If argument is the repo name, use the targets API to find the target, then fetch all its projects.
- If no argument given, ask the user which package to target.

---

## Hard Constraints

These are non-negotiable. Violating any of them is a skill failure.

| # | Constraint |
|---|-----------|
| C1 | **NEVER** run `snyk test`, `snyk monitor`, or any local Snyk CLI scan. All data comes from the Snyk REST API. |
| C2 | **Require** `SNYK_TOKEN` and `SNYK_ORG_ID` env vars. If missing, STOP and tell the user to set them in `/settings`. Never print their values. |
| C3 | **NEVER** commit, push, or open a PR. Leave the working tree dirty for human review. |
| C4 | **NEVER** use `yarn install --frozen-lockfile` after modifying `package.json`. It silently skips lockfile updates, leaving vulnerable versions pinned. Always use plain `yarn install`. |
| C5 | **Always** show severity summary + issue table and get user confirmation before editing any files. |
| C6 | After all safe fixes are complete, inform the user that minor fixes are done and present the remaining major-version bumps. **Wait for user approval** before proceeding. Once approved, work through them in ascending **blast radius** order (fewest affected workspaces first). For each: apply the bump, regenerate the lockfile, verify build, run tests, then move to the next. |
| C7 | Use **exact versions** (no `^` or `~`) in yarn resolutions. Resolutions are security pins. |
| C8 | Use **scoped resolutions** (`parent/**/vuln-dep`) for transitive deps. Never use blanket `"vuln-dep": "version"` overrides. |
| C9 | On macOS, do not use bash `declare -A` (bash 3.2 lacks it). Use Python for data mapping. |
| C10 | Use Python stdlib only for version comparisons (no `packaging` module). |

---

## Prerequisites

| Requirement | Purpose | Install |
|-------------|---------|---------|
| `python3` | Version comparisons, JSON dedup | `brew install python` |
| `curl` | Snyk API calls | pre-installed |
| `jq` | JSON extraction | `brew install jq` |
| `SNYK_TOKEN` | API auth | Snyk Account Settings |
| `SNYK_ORG_ID` | Org scope | Snyk org settings page |

If any prerequisite is missing, STOP with a clear error message.

---

## Status Message Format

Use these exact formats when reporting success or failure at each phase boundary.
Never use plain prose — always wrap in a blockquote with the appropriate icon.

| Outcome | Format |
|---------|--------|
| **Success** | `> ✅ **SUCCESS:** <message>` |
| **Failure** | `> ❌ **FAILURE:** <message>` |
| **Warning / manual action needed** | `> ⚠️ **ACTION REQUIRED:** <message>` |

Examples:

> ✅ **SUCCESS:** Found 34 projects across content-authoring-home.

> ❌ **FAILURE:** Build failed in `packages/author-home` — see details below.

> ⚠️ **ACTION REQUIRED:** `yarn.lock` was not modified after install. The resolution may not have taken effect.

---

## Phases

### Phase 1: Discover

**Goal:** Identify all Snyk project IDs matching the target package.

**Step 1a — Resolve target ID:**
```
GET /rest/orgs/{org_id}/targets?version=2024-10-15&display_name=<arg>&limit=10
```
- Match the argument (case-insensitive substring) against `data[].attributes.display_name`.
- Extract `data[0].id` as the `target_id`.
- If no target is found, STOP with `> ❌ **FAILURE:** No Snyk target found matching "<arg>".`
- If multiple targets match, list them and ask the user to confirm the correct one.

**Step 1b — Fetch projects for that target:**
```
GET /rest/orgs/{org_id}/projects?version=2024-10-15&target_id=<target_id>&limit=100
```
- Paginate via `links.next` if needed (prepend `https://api.snyk.io` — it is a relative path).
- The v1 `/projects` endpoint returns HTTP 410 — do not use it.
- Resolve org slug via `GET /rest/orgs/{org_id}` for portal links.

**Output:** List of `{project_id, project_name}` pairs.

---

### Phase 2: Collect Issues

**Goal:** Pull all open vulnerabilities for each discovered project.

**API hints:**
- Use v1 aggregated issues: `POST /v1/org/{org_id}/project/{project_id}/aggregated-issues`
- Request body must include `includeIntroducedThrough: true` (needed for resolution scoping in Phase 4).
- Filter: severities=all, types=[vuln,license], ignored=false, patched=false.

**Key fields per issue:**
- `issueData.id`, `issueData.severity`, `issueData.title`
- `pkgName`, `pkgVersions`
- `fixInfo.fixedIn` (full array — not just `[0]`), `fixInfo.isUpgradable`
- `introducedThrough` (array of dependency paths)

**Output:** All issues with their project context.

---

### Phase 3: Summarize & Confirm (GATE)

**Goal:** Present findings and get user approval before touching any files.

**3a — Severity summary (raw counts, no dedup):**
Count every issue occurrence across all projects. The same CVE in 17 workspaces = 17.
This must match the portal badge counts exactly.

| Severity | Count |
|----------|-------|
| Critical | N |
| High | N |
| Medium | N |
| Low | N |
| **Total** | **N** |

**3b — Issue table (deduped by `pkgName + issueData.id`):**

Group by unique `(pkgName, issueData.id)`. If the same package appears at two different
installed versions, show them as separate rows. Display in this exact tabular format:

```
┌─────────────────────────┬──────────────────┬──────────┬──────────────────────┬─────────────────────────────────────────────┐
│ Package                 │ Old -> New       │ Severity │ Issue                │ Affected Workspaces                         │
├─────────────────────────┼──────────────────┼──────────┼──────────────────────┼─────────────────────────────────────────────┤
│ @grpc/grpc-js           │ 1.13.4 -> 1.13.5 │ HIGH     │ Uncaught Exception   │ author-home/server                          │
│                         │                  │          │                      │ author-nav/server                           │
│                         │                  │          │                      │ content-authoring-home-api                  │
│                         │                  │          │                      │ nestjs-kafka-consumers                      │
├─────────────────────────┼──────────────────┼──────────┼──────────────────────┼─────────────────────────────────────────────┤
│ joi                     │ -- (manual)      │ MEDIUM   │ Uncaught Exception   │ author-nav/server                           │
│                         │                  │          │                      │ common                                      │
│                         │                  │          │                      │ content-home-api                            │
└─────────────────────────┴──────────────────┴──────────┴──────────────────────┴─────────────────────────────────────────────┘
```

Column rules:
- **Old -> New**: installed version -> lowest safe `fixedIn` within the fixedIn array
  (pick the best match from the full `fixedIn` array, not just `fixedIn[0]`).
  If no fix exists: `-- (manual: X -> Y, major bump)`.
  If `fixedIn` is empty: `-- (no fix available)`.
- **Affected Workspaces**: list **every** workspace path where this vulnerability
  appears — do not truncate or summarise with `... (+N more)`. Stack them vertically
  in the same cell. Extract from project name: strip prefix up to `repo-name:`,
  remove `/package.json`.

After the table, summarize findings in two labeled groups using **exactly** this wording:

**Minor fixes (safe — will be applied first):**
- List each fixable issue (fix stays within the same major version) with package, version bump, and affected workspaces.

**Major changes (require your approval):**
- List each issue where the fix requires a major version bump, with package, installed version, target version, and affected workspaces.

**Notes (optional):** If there are observations about existing resolutions, dependency paths, or other context worth surfacing, append them *after* the Major changes list — never between the issue table and the Minor/Major summaries.
**STOP here. Ask the user to confirm before proceeding.**

---

### Phase 4: Fix

**Goal:** Bump fixable dependencies in `package.json` files.

**Classification rules:**

| Type | Detection | Action |
|------|-----------|--------|
| **Direct dep** | `pkgName` found in `dependencies` or `devDependencies` of a workspace `package.json` | Bump version in that `package.json` |
| **Transitive dep** | `pkgName` NOT in any workspace `package.json` | Add scoped resolution in root `package.json` (if single root `yarn.lock`) or per-workspace `package.json` (if multiple lockfiles) |
| **Major bump required** | Lowest `fixedIn` has different major than installed | Skip. Report in "Cannot fix" table. |
| **No fix available** | `fixedIn` is empty | Skip. Report in "Major Changes" table. |

**Transitive resolution scoping:**
- Derive the top-level parent from `introducedThrough[0][0]` in the API response.
- Resolution key format: `"parent-pkg/**/vuln-dep": "exact-version"`
- If same vuln-dep comes through multiple parents, add one entry per parent.

---

### Phase 5: Reinstall

**Goal:** Regenerate `yarn.lock` with the new versions.

- Run `yarn install` (plain — **never** `--frozen-lockfile`) from the appropriate directory.
- For yarn workspaces with single root lockfile: run from repo root.
- For multi-lockfile repos: run per modified package directory.
- **Verify** `yarn.lock` appears modified in `git status`.
  - If modified: emit `> ✅ **SUCCESS:** yarn.lock regenerated — new versions are pinned.`
  - If unchanged: emit `> ❌ **FAILURE:** yarn.lock was not modified — the resolution did not take effect.` and STOP.

---

### Phase 6: Verify

**Sequence matters — do not run tests until builds pass.**

**6a — Build (parallel):**
Build every project whose `package.json` was modified. Run all in parallel, collect results.

| Result | Action |
|--------|--------|
| All pass | Emit `> ✅ **SUCCESS:** All builds passed.` then proceed to 6b. |
| Any fail | Emit `> ❌ **FAILURE:** Build failed in \`<package>\` — see details below.` then STOP. Show failure output. Ask user to revert or confirm continuing. |

**6b — Unit tests:**
Run `yarn test:u` from repo root (or per-package if root lacks the script).

| Result | Action |
|--------|--------|
| All pass | Emit `> ✅ **SUCCESS:** All unit tests passed.` |
| Any fail | Emit `> ❌ **FAILURE:** Unit tests failed in \`<package>\` — N failing test(s).` then STOP. Show only failing test names + counts (no passing output). Ask user to revert or accept. |

---

### Phase 7: Report

**After minor fixes are complete:**

Do NOT display a "Fixed" table. Instead, output a single status message:

> ✅ **SUCCESS:** All minor fixes applied successfully. Nothing was committed — review the diff, then commit when ready.

Then present only the major-version bumps that remain, in box-drawing format:

**Pending Major Changes:**
```
┌─────────────────────────┬───────────────┬──────────┬──────────────────────┬──────────────────────────────────────────────────────┐
│ Package                 │ Installed     │ Severity │ Reason               │ Portal Links                                         │
├─────────────────────────┼───────────────┼──────────┼──────────────────────┼──────────────────────────────────────────────────────┤
│ joi                     │ 14.3.1        │ MEDIUM   │ fixedIn 18.2.1       │ https://app.snyk.io/org/{slug}/project/{id}           │
│                         │               │          │ (major bump)         │                                                      │
└─────────────────────────┴───────────────┴──────────┴──────────────────────┴──────────────────────────────────────────────────────┘
```

**STOP. Ask the user to confirm before proceeding with major changes.**

Once approved, work through major bumps in ascending blast radius order (fewest affected workspaces first). After all major fixes are complete, emit:

> ✅ **SUCCESS:** All major-version fixes applied. Nothing was committed — review the diff, then commit when ready.

---

## Notes

- Keep token usage low: query JSON via API + `jq`, never scrape portal HTML.
- Check for multiple `yarn.lock` files before assuming single-root resolutions.
- Project name format: `<org>/<repo>:<workspace-path>/package.json`.
