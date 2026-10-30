# Jury scorecard (used by the `jury` agent)

The `jury` agent (`.claude/agents/jury.md`) scores the project against this file and nothing else.
Replace the inferred names and every `[MAX]` with the official EvoHack 2026 rubric wording and maximum points.
Until a criterion has a number, the agent scores it out of 10 and leaves it out of the points total.

## Elimination gates (checked first; any failure means the score is 0)
From SPEC §16: a working prototype, evidence of AI use, the deadline met, no major deviation from the problem
statement, no non-compliant behaviour.

## Criteria

| Id | Criterion (inferred from the team's ranking table; replace with the official wording) | Max points | Evidence the jury looks for |
|---|---|---|---|
| 1.1 | Discovery: users, pain points, business reason, sponsor input, baseline | [MAX] | `docs/DISCOVERY.md` linked from the README; SPEC §14.1 log; baseline 71.0%, $872,460 penalties recomputed |
| 1.2 | Requirements and edge cases traced to features and tests | [MAX] | SPEC §5 REQ/AC ids; edge-case list with no open items; REQ → feature → test table (`docs/TRACEABILITY.md`) |
| 2.1 | Core solution works on fresh, live input | [MAX] | A new email typed by the jury is processed end to end; 50-email batch; no manual switches (`LLM_PROVIDER`) |
| 2.2 | Bad input gives readable errors | [MAX] | Empty, malformed, oversized and missing-field emails and CSVs; tests and screenshots in `docs/TEST-EVIDENCE.md` |
| 2.3 | Usable by a new user | [MAX] | Record of a new-user walkthrough by someone outside the team, plus fixes for what tripped them up |
| 3.1 | README and setup | [MAX] | Deployed URL, demo sign-in, one-command setup, "verified on a clean machine" note |
| 3.3 | Decision log with alternatives and trade-offs | [MAX] | Every row has an alternative and a trade-off |
| 3.4 | Configuration over hard-coding | [MAX] | Dataset labels, rules and thresholds read from config, not literals |
| 4.1 | Measured business impact | [MAX] | Before-vs-after table on on-time %, penalties $ and handling $, with the method and a golden test; 88.5% / 85.9% / 92.0% consistent everywhere |
| 4.2 | Scale and reuse | [MAX] | Timed 1× and 10× runs (rows, seconds, peak memory); a "reuse for another client" run; `docs/SCALE-RUN.md` |
| 5.1 | Innovation with measured before vs after | [MAX] | Each idea has a measured result (e.g. extraction ≥ 48/50, time to decide an order for AC-NFR-02, Today vs With Root Route) |
| 6.1 | Demo video | [MAX] | 5 min, real app, jury-style input, one bad-input case, results explained, short pitch |
| 6.2 | Presentation: problem → solution → impact | [MAX] | Slides or video narrative using the 4.1 numbers |
| 6.3 | Pitch and Q&A readiness | [MAX] | Clear story, numbers match the app |
| 7.1 | Environments and deployment | [MAX] | Separate dev/test/prod config; documented from-scratch run of `infra/setup.sh`; smoke test on the deployed URL |
| 7.2 | Test evidence | [MAX] | `docs/TEST-EVIDENCE.md` current; tests name their AC ids; CI green |
| 7.3 | Security | [MAX] | Secrets-scan report committed; least-privilege table for the Azure identities; SEC-* checks |
| 7.4 | Roadmap | [MAX] | `docs/ROADMAP.md` linked from the README and the deck |
