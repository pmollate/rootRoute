# Traceability Checklist

Traceability ensures every requirement can be traced from its origin (Jira) through implementation (MR), validation (CI), and deployment. This is the backbone of Spec-Driven Development.

---

## The 5-Link Chain

```
Jira Ticket → Spec Document → Merge Request → CI/Tests → Deployment
```

Each link must reference the previous one. If any link is broken, traceability is lost.

---

## Link 1: Jira Ticket → Spec

| Item | Check |
|---|---|
| Spec references Jira ticket ID in header table | `**Jira Ticket** \| [PROJ-1234](link)` |
| Jira ticket links to spec file | Add spec path as a comment or in the Description |
| Jira ticket status reflects spec progress | Move to "Spec In Progress" or equivalent when drafting |

**Naming convention:** `specs/draft/PROJ-1234-short-description.md`

---

## Link 2: Spec → Merge Request

| Item | Check |
|---|---|
| MR description references the spec | "Implements spec: `specs/draft/PROJ-1234-feature.md`" |
| MR title includes Jira ticket ID | "PROJ-1234: Implement user export API" |
| Spec requirement IDs appear in commit messages or MR description | "Implements REQ-001, REQ-002, REQ-003" |

**MR description template:**

```markdown
## Spec Reference
- Spec: `specs/draft/PROJ-1234-feature.md`
- Jira: [PROJ-1234](link)

## Requirements Implemented
- REQ-001: [brief description]
- REQ-002: [brief description]

## Requirements NOT in this MR
- REQ-003: Will be implemented in follow-up MR
```

---

## Link 3: Merge Request → CI/Tests

| Item | Check |
|---|---|
| Acceptance criteria from spec become test cases | Each AC-X maps to one or more test functions |
| Test names/descriptions reference requirement IDs | `test_req_001_returns_401_without_auth()` |
| CI pipeline runs the relevant test suites | Tests execute automatically on MR creation/update |

**Test naming convention:**

```
test_[req_id]_[behavior_description]

Examples:
  test_req_001_rejects_unauthenticated_requests
  test_req_002_returns_paginated_results
  test_nfr_001_responds_within_200ms_p95
  test_sec_001_hashes_passwords_with_bcrypt
```

---

## Link 4: CI → Deployment

| Item | Check |
|---|---|
| CI pipeline passes before merge | All tests green, no linting errors |
| Deployment references the MR/commit | Deployment log includes MR number or commit SHA |
| Feature flag (if used) is documented in spec | Spec notes flag name and expected rollout plan |

---

## Link 5: Post-Deployment Verification

| Item | Check |
|---|---|
| Spec acceptance criteria verified in production | Smoke tests or manual verification against ACs |
| Spec status updated | Move from `draft/` to `approved/` after successful deployment |
| Jira ticket updated | Move to "Done" with link to deployed MR |

---

## Quick Reference: What Goes Where

| Artifact | Must Reference |
|---|---|
| **Spec** | Jira ticket ID, requirement IDs |
| **Jira ticket** | Spec file path |
| **MR description** | Spec path, Jira ticket, requirement IDs implemented |
| **Commit messages** | Jira ticket ID |
| **Test functions** | Requirement IDs (in name or docstring) |
| **Deployment notes** | MR number, Jira ticket ID |

---

## Traceability Audit

To verify traceability for a completed feature, check:

1. **Forward trace** (requirement → code): Can you find the code implementing each REQ-XXX?
2. **Backward trace** (code → requirement): For each significant code change, can you identify which requirement it fulfills?
3. **Test trace**: Does every **MUST** requirement have at least one automated test?
4. **Gap analysis**: Are there any requirements with no corresponding code or tests?

If any trace is broken, update the artifacts to restore the chain.
