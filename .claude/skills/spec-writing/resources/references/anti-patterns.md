# Spec Writing Anti-Patterns

Common mistakes in spec writing with symptoms, fixes, and examples.

---

## Requirement Anti-Patterns

| # | Anti-Pattern | Symptom | Fix | Bad Example | Good Example |
|---|---|---|---|---|---|
| 1 | **Vague requirement** | Can't write a test for it | Add measurable criteria | "The system should be fast" | "The API **MUST** respond within 200ms at p95" |
| 2 | **Compound requirement** | Two behaviors in one ID | Split into separate requirements | "REQ-001: The system **MUST** validate input and log all requests" | REQ-001: validate input; REQ-002: log requests |
| 3 | **Implementation masquerading as requirement** | Specifies HOW instead of WHAT | Describe the behavior, not the code | "The system **MUST** use Redis for caching" | "The system **MUST** cache user profiles with a TTL of 5 minutes" |
| 4 | **Unbounded requirement** | No limits or thresholds | Add concrete bounds | "The system **MUST** handle large files" | "The system **MUST** handle files up to 500MB" |
| 5 | **Orphaned requirement** | No acceptance criterion maps to it | Add a matching AC or remove the requirement | REQ-007 exists but no AC references it | Every REQ-XXX has at least one AC-X |
| 6 | **Kitchen-sink MUST** | Everything is MUST | Reassess — use SHOULD/MAY where appropriate | 15 out of 15 requirements are MUST | ~50% MUST, ~35% SHOULD, ~15% MAY |
| 7 | **Missing actor** | Unclear who/what performs the action | Specify the actor | "Settings **MUST** be configurable" | "Admin users **MUST** be able to configure notification settings" |
| 8 | **Negative-only requirement** | Says what NOT to do but not what TO do | Add the positive behavior | "The system **MUST NOT** crash on invalid input" | "The system **MUST** return a 400 error with a descriptive message for invalid input" |

---

## Structure Anti-Patterns

| # | Anti-Pattern | Symptom | Fix |
|---|---|---|---|
| 9 | **Missing Out of Scope** | Scope creep during implementation | Always list 2-3+ items that are explicitly excluded |
| 10 | **Context as solution** | Context section describes the technical approach | Context = problem. Technical Design = solution. Keep them separate. |
| 11 | **Acceptance criteria echo requirements** | ACs just restate requirements in different words | ACs should use Given/When/Then with concrete test scenarios |
| 12 | **No requirement IDs** | Can't trace requirements to tests or acceptance criteria | Every requirement gets a unique ID: REQ-001, NFR-001, SEC-001 |
| 13 | **Monolithic Technical Design** | One giant paragraph for all implementation details | Break into subsections: Architecture, Data Model, API Changes, Key Details |
| 14 | **Missing rollback plan for data changes** | No recovery path if migration fails | Any spec touching data **MUST** include rollback steps |
| 15 | **Open questions never resolved** | Spec approved with TODOs remaining | All open questions must be resolved before moving to approved/ |

---

## Language Anti-Patterns

| # | Anti-Pattern | Symptom | Fix | Example |
|---|---|---|---|---|
| 16 | **Casual RFC 2119 keywords** | "must" used without normative meaning | Only bold keywords when used normatively | "We must think about edge cases" → "We need to consider edge cases" |
| 17 | **Weasel words** | "approximately", "reasonably", "as needed" | Replace with concrete values | "approximately 100ms" → "within 150ms" |
| 18 | **Passive voice hiding actors** | "The data will be processed" | Name the actor and make it active | "The ingestion service **MUST** process incoming data within 30 seconds" |
| 19 | **Hedging language** | "might", "could", "possibly" | Commit to a requirement level or remove | "This could improve performance" → (remove, or state as a goal) |
| 20 | **Future tense promises** | "The system will eventually support..." | Use present tense for requirements, or move to Out of Scope | "The API will support batch operations" → Out of Scope: batch operations |

---

## Process Anti-Patterns

| # | Anti-Pattern | Symptom | Fix |
|---|---|---|---|
| 21 | **Spec after implementation** | Spec written to document what was already built | Write spec before code. Retrofit specs have less value — they justify rather than guide. |
| 22 | **Spec as design doc** | 20+ pages of architecture details | Specs define WHAT, not deep HOW. Keep technical design focused on decisions, not tutorials. |
| 23 | **No Jira linkage** | Spec exists but can't be found from the ticket | Always include Jira ticket ID in spec header; reference spec path in Jira ticket. |
| 24 | **Premature approval** | Spec approved before all stakeholders reviewed | Ensure all listed reviewers have signed off before moving to approved/. |
| 25 | **Stale spec** | Implementation diverged but spec wasn't updated | Update spec when requirements change during implementation. |

---

## Self-Review Checklist

Before marking a spec complete, verify none of these anti-patterns are present:

- [ ] Every requirement has a unique ID
- [ ] Every requirement uses exactly one RFC 2119 keyword
- [ ] Every **MUST** has a matching acceptance criterion
- [ ] No compound requirements (one behavior per ID)
- [ ] Requirements describe WHAT, not HOW
- [ ] All requirements have measurable/testable criteria
- [ ] Out of Scope lists at least 2 items
- [ ] No unresolved open questions
- [ ] Context describes the problem, not the solution
- [ ] Acceptance criteria use Given/When/Then format
- [ ] Actors are specified for all requirements
- [ ] Data-touching specs have rollback plans
