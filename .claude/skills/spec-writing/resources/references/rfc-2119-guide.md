# RFC 2119 Keyword Guide for Specifications

This guide defines how to use RFC 2119 keywords in specifications. These keywords indicate requirement levels and have precise meanings that create testable obligations.

**Rule: Always bold RFC 2119 keywords when used with their normative meaning.**

---

## Keyword Definitions

### MUST / MUST NOT

**Meaning:** Absolute requirement or absolute prohibition. No exceptions.

**When to use:**
- Security invariants (authentication, authorization, encryption)
- Data integrity (no data loss, referential integrity)
- Contractual obligations (API contracts, SLAs)
- Legal/compliance requirements (GDPR, SOC2)
- Core functionality without which the feature is broken

**Decision test:** "If this isn't met, is the feature fundamentally broken or unsafe?" → **MUST**

**Examples:**

| Good Usage | Why |
|---|---|
| The API **MUST** require authentication for all non-public endpoints | Security invariant — unauthenticated access is a vulnerability |
| The migration **MUST NOT** delete any existing user records | Data integrity — data loss is unacceptable |
| Passwords **MUST** be hashed using bcrypt with a minimum cost factor of 12 | Security requirement — specific and verifiable |
| The endpoint **MUST** return a 401 status code when no valid token is provided | API contract — consumers depend on this behavior |
| The export **MUST** include all fields present in the source record | Data completeness — partial exports are incorrect |
| The system **MUST NOT** log PII in plaintext | Compliance requirement — regulatory obligation |
| Failed transactions **MUST** be rolled back atomically | Data integrity — partial state is corruption |
| The webhook **MUST** retry delivery up to 3 times with exponential backoff | Contractual — consumers expect guaranteed delivery |
| Input **MUST** be sanitized before database insertion | Security — SQL injection prevention |
| The response body **MUST** conform to the JSON:API specification | API contract — consumers parse this format |

### SHOULD / SHOULD NOT

**Meaning:** Recommended best practice, but valid exceptions may exist. The implementer must understand the implications of deviating.

**When to use:**
- Performance targets (with known trade-offs)
- UX best practices (where edge cases exist)
- Operational recommendations (logging, monitoring)
- Patterns that are correct 95%+ of the time

**Decision test:** "Is there a legitimate scenario where not doing this is acceptable?" → **SHOULD**

**Examples:**

| Good Usage | Why |
|---|---|
| The API **SHOULD** respond within 200ms at p95 | Performance target — acceptable to exceed for complex queries |
| Error responses **SHOULD** include a `request_id` for debugging | Best practice — not every error source can include it |
| The UI **SHOULD** display a loading indicator for operations > 500ms | UX — some contexts may have alternative feedback |
| Database queries **SHOULD** use parameterized statements | Best practice — raw SQL may be needed for complex analytics |
| Log entries **SHOULD** include correlation IDs | Operational — useful but not always available at every layer |
| The service **SHOULD NOT** make synchronous calls to external APIs in the request path | Architecture — sometimes unavoidable for real-time data |
| Cached responses **SHOULD** include `Cache-Control` headers | HTTP best practice — some responses legitimately skip caching |
| Admin actions **SHOULD** be logged to an audit trail | Operational — low-risk read-only actions may be excluded |
| Batch operations **SHOULD NOT** exceed 1000 items per request | Practical limit — edge cases may warrant larger batches |
| The retry mechanism **SHOULD** use jitter to avoid thundering herd | Best practice — simple retry may suffice for low-traffic endpoints |

### MAY

**Meaning:** Truly optional. The implementer can include or omit this without justification.

**When to use:**
- Nice-to-have features
- Future considerations mentioned for context
- Implementation flexibility (multiple valid approaches)
- Enhancements that depend on available time/budget

**Decision test:** "Would it be acceptable to ship without this entirely?" → **MAY**

**Examples:**

| Good Usage | Why |
|---|---|
| The response **MAY** include pagination metadata for non-paginated endpoints | Convenience — not needed but helpful for consistent client code |
| The UI **MAY** pre-populate the form with the user's last-used values | Enhancement — nice UX but not essential |
| The service **MAY** cache frequently accessed resources in Redis | Implementation choice — performance optimization, not a requirement |
| The error response **MAY** include suggested actions for the user | Polish — helps UX but not needed for correctness |
| The export **MAY** support additional formats (PDF, Excel) in future iterations | Future scope — mentioned for context, not a current requirement |

---

## Decision Tree

```
Is the system broken, unsafe, or non-compliant without this?
├── YES → MUST / MUST NOT
└── NO
    ├── Is this a best practice with rare valid exceptions?
    │   ├── YES → SHOULD / SHOULD NOT
    │   └── NO
    │       └── Is this truly optional / nice-to-have?
    │           └── YES → MAY
    └── (If none fit, it might not be a requirement — consider removing it)
```

---

## Common Mistakes

| Mistake | Example | Fix |
|---|---|---|
| Using MUST for preferences | "The button **MUST** be blue" | "The button **SHOULD** use the primary brand color" (unless brand compliance is mandatory) |
| Using SHOULD when it's actually required | "Passwords **SHOULD** be hashed" | "Passwords **MUST** be hashed" — this is a security invariant |
| Using MAY for things that are actually SHOULD | "The service **MAY** log errors" | "The service **SHOULD** log errors" — this is a strong best practice |
| Using keywords casually | "This must be a good feature" | Don't bold "must" unless it's a normative requirement. Rephrase: "This feature should provide clear value" |
| Stacking keywords | "The system **MUST** and **SHOULD**..." | Pick one. Each requirement gets one keyword. |
| MUST without testability | "The system **MUST** be user-friendly" | "The primary workflow **MUST** complete in 3 or fewer clicks" |

---

## Keyword Frequency Guidelines

A well-balanced spec typically has:

| Keyword | Expected % of Requirements | Red Flag If |
|---|---|---|
| **MUST** | 40-60% | > 80% (everything is critical?) or < 20% (nothing is firm?) |
| **SHOULD** | 25-40% | < 10% (no best practices?) or > 60% (nothing is firm?) |
| **MAY** | 5-15% | > 30% (too many nice-to-haves dilute the spec) |

If your spec has 15 requirements and 14 are **MUST**, reconsider which are truly non-negotiable.
