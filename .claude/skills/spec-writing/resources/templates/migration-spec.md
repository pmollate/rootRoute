# Migration Specification: [Title]

<!-- Replace [Title] with a descriptive name, e.g., "Users Table Email Normalization" -->

| Field | Value |
|---|---|
| **Jira Ticket** | [PROJ-XXXX](link) |
| **Author** | [Name] |
| **Status** | Draft |
| **Created** | YYYY-MM-DD |
| **Last Updated** | YYYY-MM-DD |
| **Size** | Small / Medium / Large / Complex |
| **Reviewers** | [Names] |
| **Migration Type** | Schema / Data / Combined |
| **Downtime Required** | Yes / No |

---

## 1. Context & Problem Statement

<!-- 2-4 sentences: current data state, why migration is needed, impact of not doing it.
  Link the Jira ticket.
-->

## 2. Goals

1.
2.
3.

## 3. Current State

### 3.1 Existing Schema

<!-- Show the current table/schema definition that will be changed.
  Include relevant columns, types, constraints, indexes.
-->

```sql
-- Current schema
```

### 3.2 Current Data Profile

<!-- Describe the data that will be affected:
  - Total row count (approximate)
  - Data distribution relevant to the migration
  - Known data quality issues
-->

| Metric | Value |
|---|---|
| Total rows | |
| Estimated migration time | |
| Data size on disk | |

## 4. Target State

### 4.1 New Schema

<!-- Show the target table/schema after migration.
  Highlight what changed from Current State.
-->

```sql
-- Target schema (changes highlighted in comments)
```

### 4.2 Schema Diff

<!-- Concise summary of changes -->

| Change | Table | Column | Details |
|---|---|---|---|
| ADD | | | |
| MODIFY | | | |
| DROP | | | |
| ADD INDEX | | | |

## 5. Requirements

### 5.1 Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| REQ-001 | The migration **MUST** transform [data] from [old format] to [new format] | High |
| REQ-002 | | |

### 5.2 Data Integrity Requirements

| ID | Requirement | Priority |
|---|---|---|
| DI-001 | The migration **MUST NOT** result in data loss for any existing records | High |
| DI-002 | The migration **MUST** maintain referential integrity across all foreign keys | High |
| DI-003 | | |

### 5.3 Performance Requirements

| ID | Requirement | Priority |
|---|---|---|
| PERF-001 | The migration **MUST** complete within [X] hours/minutes | High |
| PERF-002 | The migration **SHOULD NOT** lock tables for more than [X] seconds | High |
| PERF-003 | | |

## 6. Migration Strategy

### 6.1 Approach

<!-- Choose and describe the approach:
  - **Big Bang:** Single migration run. Simple but requires downtime for large datasets.
  - **Online/Zero-downtime:** Dual-write, backfill, cutover. Complex but no downtime.
  - **Phased:** Multiple migration steps over time. Good for very large datasets.
-->

**Approach:** Big Bang / Online / Phased

### 6.2 Migration Steps

<!-- Ordered list of migration operations.
  Each step should be independently verifiable.
  Include estimated duration per step.
-->

| Step | Description | Estimated Duration | Reversible? |
|---|---|---|---|
| 1 | | | Yes / No |
| 2 | | | |
| 3 | | | |

### 6.3 Data Transformation Rules

<!-- How existing data maps to the new schema.
  Include handling for: NULL values, edge cases, invalid data.
-->

| Source | Transformation | Target | Edge Cases |
|---|---|---|---|
| `old_column` | [transformation logic] | `new_column` | NULL → default value |

## 7. Backward Compatibility

<!-- How will the application work during and after migration?
  - Can old and new code coexist? (dual-read/dual-write period)
  - What application changes are needed before/after migration?
  - Feature flag strategy?
-->

### 7.1 Application Changes Required

| Timing | Change | Description |
|---|---|---|
| Before migration | | |
| After migration | | |
| Cleanup (post-verification) | | |

## 8. Rollback Plan

<!-- REQUIRED for all migration specs. Describe exactly how to undo the migration. -->

### 8.1 Rollback Steps

| Step | Description | Estimated Duration |
|---|---|---|
| 1 | | |
| 2 | | |

### 8.2 Rollback Triggers

<!-- Under what conditions should rollback be initiated? -->

- Data integrity check fails after migration
- Application error rate exceeds [X]% post-migration
- Migration exceeds maximum allowed duration

### 8.3 Point of No Return

<!-- Is there a step after which rollback becomes impossible or extremely difficult?
  If yes, what safeguards are in place?
-->

## 9. Validation & Verification

### 9.1 Pre-Migration Checks

<!-- Checks to run before starting the migration -->

| Check | Expected Result | Action if Fails |
|---|---|---|
| Row count of source table | [expected count] | Abort migration |
| | | |

### 9.2 Post-Migration Checks

<!-- Checks to run after migration to verify success -->

| Check | Expected Result | Action if Fails |
|---|---|---|
| Row count matches pre-migration | Same count (± [tolerance]) | Trigger rollback |
| Referential integrity check | No orphaned records | Trigger rollback |
| Application smoke test | All endpoints return 200 | Investigate |
| | | |

## 10. Acceptance Criteria

| # | Criterion | Requirement(s) |
|---|---|---|
| AC-1 | **Given** the migration has run, **When** querying [table], **Then** all rows match the target schema | REQ-001 |
| AC-2 | **Given** the migration has run, **When** comparing row counts, **Then** no data is lost | DI-001 |
| AC-3 | | |

## 11. Out of Scope

1.
2.
3.

## 12. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Migration takes longer than estimated | Medium | High | Run on staging with production-size dataset first |
| Data corruption during transformation | Low | Critical | Pre-migration backup, row-level checksums |
| Application errors during dual-write period | Medium | Medium | Feature flag for instant rollback |

## 13. Execution Plan

<!-- When and how the migration will be run -->

| Item | Detail |
|---|---|
| **Scheduled Window** | [Date/time, timezone] |
| **Executed By** | [Name/team] |
| **Communication Plan** | [Who to notify before/during/after] |
| **Monitoring** | [Dashboards, alerts to watch] |
| **Backup Taken** | Yes — [backup location/method] |

## 14. Open Questions

1.
