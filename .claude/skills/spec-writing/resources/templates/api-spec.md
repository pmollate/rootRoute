# API Specification: [Title]

<!-- Replace [Title] with the API feature name, e.g., "User Export API" -->

| Field | Value |
|---|---|
| **Jira Ticket** | [PROJ-XXXX](link) |
| **Author** | [Name] |
| **Status** | Draft |
| **Created** | YYYY-MM-DD |
| **Last Updated** | YYYY-MM-DD |
| **Size** | Small / Medium / Large / Complex |
| **Reviewers** | [Names] |
| **API Version** | v1 / v2 / ... |

---

## 1. Context & Problem Statement

<!-- 2-4 sentences: current state, what's missing, why this API change matters.
  Link the Jira ticket.
-->

## 2. Goals

1.
2.
3.

## 3. Endpoint Specifications

### 3.1 [METHOD] /path/to/endpoint

<!-- Repeat this subsection for each endpoint. -->

**Description:** Brief description of what this endpoint does.

**Authentication:** Required / Optional / None
**Authorization:** Roles or permissions required.

#### Request

**Headers:**

| Header | Required | Description |
|---|---|---|
| `Authorization` | Yes | Bearer token |
| `Content-Type` | Yes | `application/json` |

**Path Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string (UUID) | Yes | Resource identifier |

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `page` | integer | No | 1 | Page number |
| `per_page` | integer | No | 20 | Items per page (max 100) |

**Request Body:**

```json
{
  "field_name": "string — description of field",
  "optional_field": "string? — description (optional)"
}
```

**Validation Rules:**
<!-- List validation constraints for request fields.
  Example: "field_name **MUST** be between 1 and 255 characters"
-->

| Field | Rule |
|---|---|
| | |

#### Response

**Success (200 OK):**

```json
{
  "data": {
    "id": "uuid",
    "field_name": "value"
  },
  "meta": {
    "total": 100,
    "page": 1,
    "per_page": 20
  }
}
```

**Error Responses:**

| Status | Code | Description | When |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid request body | Request fails validation |
| 401 | `UNAUTHORIZED` | Missing or invalid token | No valid auth provided |
| 403 | `FORBIDDEN` | Insufficient permissions | User lacks required role |
| 404 | `NOT_FOUND` | Resource not found | ID doesn't exist |
| 422 | `UNPROCESSABLE_ENTITY` | Business rule violation | Describe specific case |
| 429 | `RATE_LIMITED` | Too many requests | Rate limit exceeded |
| 500 | `INTERNAL_ERROR` | Unexpected server error | Unhandled exception |

**Error Body Format:**

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description",
    "details": []
  }
}
```

## 4. Requirements

### 4.1 Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| REQ-001 | | High / Medium / Low |
| REQ-002 | | |

### 4.2 Non-Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| NFR-001 | The endpoint **MUST** respond within [X]ms at p95 under normal load | High |
| NFR-002 | The endpoint **MUST** support [X] requests per second per client | High |
| NFR-003 | | |

### 4.3 Security Requirements

| ID | Requirement | Priority |
|---|---|---|
| SEC-001 | All endpoints **MUST** require authentication via Bearer token | High |
| SEC-002 | | |

## 5. Rate Limiting & Quotas

<!-- Define rate limits per endpoint or globally.
  Include: requests per second/minute, burst limits, quota resets.
  Omit if using platform defaults.
-->

| Endpoint | Rate Limit | Burst | Quota Reset |
|---|---|---|---|
| | | | |

## 6. Pagination

<!-- Define pagination strategy: offset-based, cursor-based, or keyset.
  Include: default page size, max page size, response format.
-->

**Strategy:** Offset-based / Cursor-based / Keyset

## 7. Versioning & Backward Compatibility

<!-- Describe how this change relates to existing API versions.
  Is this a new version? Additive change to existing version?
  What happens to existing consumers?
-->

## 8. Technical Design

### 8.1 Architecture Overview

<!-- Services involved, data flow, integration points. -->

### 8.2 Data Model Changes

<!-- New or modified tables/schemas supporting the API. -->

### 8.3 Key Implementation Details

<!-- Caching strategy, async processing, third-party calls, etc. -->

## 9. Acceptance Criteria

| # | Criterion | Requirement(s) |
|---|---|---|
| AC-1 | **Given** [precondition], **When** [API call], **Then** [expected response] | REQ-001 |
| AC-2 | | |

## 10. Out of Scope

1.
2.
3.

## 11. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| | | | |

## 12. Rollback Plan

<!-- How to revert: feature flags, API version routing, database rollback. -->

## 13. Open Questions

1.
