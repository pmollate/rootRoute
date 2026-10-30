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

## Sample outputs: Dev, DevOps and QA

Real outputs of the three role agents, each with its instruction file (role, scope, inputs, outputs, guardrails).

| Agent | Instruction file | What it produced | Where to see it |
|---|---|---|---|
| Dev (`implementer`) | [`implementer.md`](../../.claude/agents/implementer.md) | The emailed verification code for the address link: migration 105, API routes, proxy, page, 13 API and 12 web tests | Commit `f11d583`, run record [`2026-10-31-implementer-E19-verify-code.md`](2026-10-31-implementer-E19-verify-code.md); in PR #94 (`A20-link-azure`) |
| Dev (`implementer`) | same | The address link's API routes and its page (tasks A18, A19), test-first | Commits `5a6e71e`, `b647d50`; run records [`A18`](2026-10-30-implementer-A18-link-routes.md), [`A19`](2026-10-30-implementer-A19-link-page.md) |
| DevOps (`devops`) | [`devops.md`](../../.claude/agents/devops.md) | Read-only review of `ci.yml`, `cd.yml` and `infra/`: a verdict with evidence, and the main gap (`setup-auth.sh` fixed to `rootroute01`) | Run record [`2026-10-30-devops-pipeline-review.md`](2026-10-30-devops-pipeline-review.md); the gap closed in `infra/setup-auth.sh` (31 Oct: `NAME`, `RG`, `WEB_URL` settings) |
| QA (`qa-evidence`) | [`qa-evidence.md`](../../.claude/agents/qa-evidence.md) | Every suite run with counts, AC coverage and the extraction score, rewritten into the test evidence | [`docs/TEST-EVIDENCE.md`](../TEST-EVIDENCE.md) (commit `fa79d27`: 737/737, AC coverage 144/204); run records [`qa-evidence`](2026-10-30-qa-evidence.md), [`qa-evidence-2`](2026-10-30-qa-evidence-2.md) |

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
