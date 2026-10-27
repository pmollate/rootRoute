# Agent runs

Records of the role agents in `.claude/agents/` doing their part of how we build LateLens (SPEC §4.4 "Agents in how
we build", Level 1 checklist §16). One file per run; keep them, never rewrite an old one.

## The agents

| Agent | Role | Typical trigger | What it changes | Run record |
|---|---|---|---|---|
| `spec-writer` | Spec writer | A requirement, scope decision or answer must land in the SPEC | `docs/SPEC.md`, `docs/CONTRACTS.md` | `…-spec-writer-<topic>.md` |
| `planner` | Planner | A SPEC change needs tasks, or a plan drifts from the code | `docs/superpowers/plans/` | `…-planner-<topic>.md` |
| `implementer` | Implementer | One plan task (e.g. "Task C6") | Code and tests on the task branch; plan ticks | `…-implementer-<task>.md` |
| `reviewer` | Code reviewer | A task branch or PR before a teammate reviews | Nothing (reports only) | `…-reviewer-<branch>.md` |
| `numbers-auditor` | Numbers auditor | Before a demo, deploy or deck update | Nothing (reports only) | `…-numbers-auditor.md` |
| `qa-evidence` | QA / test evidence | After a merge or deploy | `docs/TEST-EVIDENCE.md` | `…-qa-evidence.md` |
| `discovery-recorder` | Discovery recorder | A question asked or an answer received | SPEC §14.1, §12, §14 | `…-discovery-recorder.md` |

The flow for a feature: `discovery-recorder` → `spec-writer` → `planner` → `implementer` → `reviewer` (then a teammate
on the PR) → `qa-evidence` and `numbers-auditor` after merge and deploy. A person decides at every hand-off: agents
propose, people approve, the same rule as the agents inside the product.

## How to run one

In Claude Code, from the repo root: "Use the reviewer agent on branch C8-azure-deploy", or `@reviewer …`.
Each agent writes its record here before it finishes.

## Run record format

File name `YYYY-MM-DD-<agent>-<topic>.md`:

```markdown
# <agent> · <topic> · <date>

**Asked by:** <person> · **Branch / commit:** <ref>
**Request:** <one or two sentences>

## What it did
- <steps, commands run and their results (counts, not adjectives)>

## Output
- <files changed, findings, verdict>

## Handed to
- <next agent or person, and what for>
```
