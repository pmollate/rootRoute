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
| `network-security-auditor` | Network and app security | Before a deploy or judging, after an infra or auth change | Nothing (read-only probes, reports only) | `…-network-security-auditor.md` |
| `privacy-compliance-auditor` | Privacy and compliance (GDPR, US) | Before real data, after a change to personal data flows | Nothing (reports and drafts only; not legal advice) | `…-privacy-compliance-auditor.md` |
| `devops` | CI/CD, Azure infra scripts, environments and config | A pipeline or infra change, a failed CI/CD run, a new setting, before a demo or submission | Nothing by default (reviews); when asked, `.github/workflows/`, `infra/`, `docker-compose.yml`, `.env.example` on a branch | `…-devops-<topic>.md` |

The flow for a feature: `discovery-recorder` → `spec-writer` → `planner` → `implementer` → `reviewer` (then a teammate
on the PR) → `devops` for pipeline and infra changes → `qa-evidence` and `numbers-auditor` after merge and deploy.
A person decides at every hand-off: agents propose, people approve, the same rule as the agents inside the product.

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
