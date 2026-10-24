# Feature Specification: [Title]

<!-- Replace [Title] with a concise, descriptive name for the feature -->

| Field | Value |
|---|---|
| **Jira Ticket** | [PROJ-XXXX](link) |
| **Author** | [Name] |
| **Status** | Draft |
| **Created** | YYYY-MM-DD |
| **Last Updated** | YYYY-MM-DD |
| **Size** | Small / Medium / Large / Complex |
| **Reviewers** | [Names] |

---

## 1. Context & Problem Statement

<!-- 2-4 sentences describing:
  - What exists today (current state)
  - What is wrong or missing (the problem)
  - Why this matters (business/user impact)
  - Link to the Jira ticket for full context
-->

## 2. Goals

<!-- What does success look like? List 2-4 measurable goals.
  Example:
  - Users can export their data in CSV format within 30 seconds
  - Admin dashboard shows export history for compliance
-->

1.
2.
3.

## 3. Requirements

### 3.1 Functional Requirements

<!-- Each requirement:
  - Has a unique ID (REQ-001, REQ-002, ...)
  - Uses RFC 2119 keywords (MUST, SHOULD, MAY) in bold
  - Is specific enough to test directly
  - Specifies WHO (the actor) and WHAT (the behavior)
-->

| ID | Requirement | Priority |
|---|---|---|
| REQ-001 | | High / Medium / Low |
| REQ-002 | | |
| REQ-003 | | |

### 3.2 Non-Functional Requirements

<!-- Performance, scalability, reliability, accessibility requirements.
  Always include measurable thresholds.
  Example: "The page **MUST** load within 2 seconds on a 3G connection"
-->

| ID | Requirement | Priority |
|---|---|---|
| NFR-001 | | |
| NFR-002 | | |

### 3.3 Security Requirements

<!-- Authentication, authorization, data handling, compliance requirements.
  Include if the feature handles PII, auth, payments, or external data.
  Omit this section for features with no security implications.
-->

| ID | Requirement | Priority |
|---|---|---|
| SEC-001 | | |

## 4. Technical Design

### 4.1 Architecture Overview

<!-- High-level description of the technical approach.
  For Medium+ specs, include a diagram (mermaid or ASCII).
  Describe which services/components are affected.
-->

### 4.2 Data Model

<!-- New or modified tables, schemas, or data structures.
  Include field names, types, constraints, and indexes.
  Omit if no data model changes.
-->

### 4.3 API Changes

<!-- New or modified endpoints. Include method, path, request/response schemas.
  For API-heavy features, consider using the API spec template instead.
  Omit if no API changes.
-->

### 4.4 Key Implementation Details

<!-- Important algorithms, third-party integrations, configuration changes,
  or anything an implementing engineer needs to know.
  Keep it focused — this is not a design doc, it's a spec.
-->

## 5. Acceptance Criteria

<!-- Each criterion:
  - Maps to one or more requirements (reference by ID)
  - Uses Given/When/Then format
  - Is independently testable by QA with no clarification needed
-->

| # | Criterion | Requirement(s) |
|---|---|---|
| AC-1 | **Given** [precondition], **When** [action], **Then** [expected result] | REQ-001 |
| AC-2 | | |
| AC-3 | | |

## 6. Out of Scope

<!-- Explicitly list what this spec does NOT cover.
  Minimum 2-3 items. Prevents scope creep during implementation and review.
  Example:
  - Bulk export for admin users (separate ticket PROJ-5678)
  - Export in PDF format (future enhancement)
  - Changes to the existing import flow
-->

1.
2.
3.

## 7. Risks & Mitigations

<!-- For Medium+ specs. Each risk has a likelihood, impact, and mitigation strategy.
  Omit for Small specs unless there are known risks.
-->

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| | Low / Medium / High | Low / Medium / High | |

## 8. Rollback Plan

<!-- For Large+ specs or any spec touching data.
  Describe how to revert the change if something goes wrong post-deployment.
  Include: feature flags, migration reversibility, data backup strategy.
  Omit for Small specs with no data changes.
-->

## 9. Open Questions

<!-- List any unresolved questions that need answers before implementation begins.
  Remove this section when all questions are answered.
-->

1.
