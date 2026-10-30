# Jury scorecard (used by the `jury` agent)

The official EvoHack 2026 rubric, *Hackathon Jury Scorecard - AI Agent Solutions (100 points)*
(`Hackathon_Checklist_Scorecard.xlsx`, sheets "Jury Scorecard", "Scoring Guide" and "Submission Checklist"). The
`jury` agent (`.claude/agents/jury.md`) scores the project against this file and nothing else. The "Where in the repo"
column is ours: it says where a judge finds the evidence.

## Scoring rules (Scoring Guide)

| Band | % of Max | Meaning |
|---|---|---|
| Below avg | under 40% | Core points missing, or evidence shows it does not work |
| Average | 40% to 64% | Partly meets the criterion; gaps or manual help needed |
| Good | 65% to 85% | Meets the criterion fully, shown with evidence |
| Excellent | over 85% | Meets everything in Good and adds the extra described, shown with evidence |

1. Score each criterion from 0 to its Max, to one decimal, using the evidence column. Write in Notes which evidence
   justified the score.
2. Pick the band whose description best matches what the team showed, then place the score within that band.
   Excellent needs all the Good points plus the extra.
3. A claim without evidence (nothing shown, linked or demonstrated) scores no higher than Average.
4. If a Below avg point is present (a crash, a wrong output, secrets in the repo), that criterion stays in Below avg.
5. **Gate:** if criteria 2.1 and 2.2 together score under 40% of their Max (6.8 of 17), the team is Below avg overall,
   whatever the total.
6. Final rating from the 100-point total: over 85 Excellent, 65 to 85 Good, 40 to 64 Average, under 40 Below avg. The
   gate overrides it.

Example: criterion 2.1 (Max 10) runs the full use case but needed one manual config step = Average band, so 4.0 to 6.4.

Our own elimination gates still apply on top (SPEC §16): a working prototype, evidence of AI use, the deadline met, no
major deviation from the problem statement, no non-compliant behaviour (CLAUDE.md scope rule).

## Criteria

| Id | Criterion | Max | Evidence the team should share | Average (40–64%) | Good (65–85%) | Excellent (over 85%) | Where in the repo |
|---|---|---|---|---|---|---|---|
| **1** | **Discovery of requirements** | **15** | | | | | |
| 1.1 | Problem understanding | 5 | One-page problem statement or slide naming the target users, their pain points and the business reason; any user or sponsor input; a baseline number | Users and benefit named, but pain points and business reason not backed by data or user input | Clear problem statement with users, pain points and business reason, supported by some data or user input | Good, plus a baseline number that shows the size of the problem | `docs/DISCOVERY.md`; SPEC §1, §14.1 |
| 1.2 | Requirements, scope & traceability | 10 | Requirements document or table (functional, non-functional, assumptions, constraints, out of scope) and a requirement-to-feature mapping with edge cases listed | Functional requirements listed; NFRs, assumptions, constraints or out of scope missing; only some mapped | Functional and non-functional requirements, assumptions and constraints; every key requirement maps to a feature; edge cases listed | Good, plus an explicit out-of-scope list, and each listed edge case is handled or tested | SPEC §5, §8, §12; `docs/TRACEABILITY.md` |
| **2** | **Working solution** | **22** | | | | | |
| 2.1 | End-to-end flow works | 10 | Live run in front of the jury (or an unedited recording) of the core use case on the jury's test inputs, from UI to final result | Full use case works on normal inputs, but needs manual steps (data fixes, restarts, config edits) | Full use case runs from UI to result in one go on all jury test inputs, with no manual help | Good, plus works correctly on unseen or larger inputs given on the spot | Deployed app (README); demo video |
| 2.2 | Stability, error handling & edge cases | 7 | Live demo with bad inputs (empty, malformed, oversized, missing field); screenshots or logs of the error messages | Stable on normal inputs, but bad input is not checked and gives no error message | No crash during the demo; errors caught and shown with a readable message | Empty, malformed and large inputs all handled with clear messages; never a crash or a silently wrong result | README "Bad inputs to try"; `docs/TEST-EVIDENCE.md` |
| 2.3 | UI & output quality | 5 | The result screen or report shown in the demo, as the customer would see it | Output correct but raw or unlabelled; the team has to explain it | Usable by the customer as-is, with labels, units and a summary; main actions obvious | Good, with consistent, polished formatting; a new user completes the main flow without guidance | Dashboard `/dashboard/*`; demo video |
| **3** | **Technical depth & documentation** | **15** | | | | | |
| 3.1 | README & setup | 3 | README with prerequisites, configuration and run steps; sample config (`.env.example`) and sample input | README exists, but setup needs guesswork or help from the team | A new person can clone, configure and run the app by following the README alone | Good, plus prerequisites, sample config, sample input and troubleshooting tips; verified on a clean machine | `README.md`; `.env.example` |
| 3.2 | Agent instruction files | 4 | Instruction files for the Dev, DevOps and QA agents (role, scope, inputs, outputs, guardrails) and sample outputs each agent produced | Files exist, but role, scope, inputs or outputs are vague | Dev, DevOps and QA agents each have a clear role, scope, inputs and outputs written down | Good, plus written guardrails per agent and real agent outputs shown (PRs, test reports, pipeline changes) | `.claude/agents/` (`implementer`, `devops`, `qa-evidence`, …); `docs/agent-runs/` |
| 3.3 | Architecture & design choices | 4 | Architecture diagram or write-up with the tech stack and a short decision log (why this tool, not the alternative) | Diagram or description and a suitable stack, but choices not justified | Diagram or description, tech stack, and key decisions with reasons | Good, with trade-offs and alternatives recorded; team explains each choice when questioned | `docs/ARCHITECTURE.md` (§5 decision log) |
| 3.4 | Code quality | 4 | Repo link: folder structure, config files, and a search of the code for hard-coded keys, paths and URLs | Code works but sits mostly in one place, with some hard-coded values | Split into clear modules; no hard-coded secrets or file paths | Config-driven, clean layers; simplest approach that solves the problem, nothing added for show | `backend/*/<area>/`; `backend/analytics/rules.json`; `.env.example` |
| **4** | **Business impact & scalability** | **10** | | | | | |
| 4.1 | Measured business benefit | 5 | Before-vs-after numbers with how they were measured; a comparison table or test run | Benefit stated in words only, no numbers | Benefit measured in numbers, before vs after | Good, tied to the sponsor's own KPI or cost, with the baseline and method shown | `docs/IMPACT.md`; `backend/analytics/tests/test_scenarios.py` |
| 4.2 | Scalability & reusability | 5 | Test run on realistic data volume (size, time taken); note on what changes at 10× and what can be reused for other clients | Tested on demo-size data only | Tested on realistic volume, with data size and time taken shown | Good, plus reuse for another client with little change, and what breaks at 10× | `docs/SCALE-RUN.md`; `docs/ROADMAP.md` §3 |
| **5** | **Innovation** | **10** | | | | | |
| 5.1 | New idea that improves the result | 10 | Description of the new idea and a before-vs-after comparison (accuracy, speed or UX) showing it improves the result | Known approach with minor tweaks; extras added, no improvement shown | At least one new idea, shown to improve accuracy, speed or UX with a before-vs-after comparison | New approach that solves a whole class of problems, and is ready to present to the customer | `docs/IMPACT.md`; extraction eval (`eval.test.ts`) |
| **6** | **Presentation** | **13** | | | | | |
| 6.1 | Demo video | 5 | Demo video link showing the real app and the main flow, within the time limit | Real app shown, but the main flow incomplete or hard to follow | Real working app, covering the main flow within the time limit | Good, plus a bad-input case shown and the result explained clearly | README "Documents" (SharePoint link) |
| 6.2 | Story & business value | 5 | Pitch or slides showing problem, solution and impact, with the impact numbers from 4.1 | Problem and solution explained; impact claimed without numbers | Clear flow from problem to solution to impact | Good, with benefits the sponsor cares about, backed by measured numbers | Video; PPT (optional, SharePoint) |
| 6.3 | Clarity of message | 3 | Pitch or talk after which a listener can restate the problem and the solution (a PPT helps, not required) | Understandable, but cluttered or needs extra explanation | Easy to follow from start to end | Concise and consistent, with visuals that support the message | Video; PPT |
| **7** | **Go-live readiness** | **15** | | | | | |
| 7.1 | Deployment & DevOps | 5 | Live URL or deploy script; IaC or a CI/CD run; separate config for dev, test and prod | Deployable with manual steps; config mixed into the code | Deployed, or deployable with IaC or CI/CD; environments and config separated | Good, plus a fully automated pipeline that deploys from scratch, repeatably | `infra/`; `.github/workflows/`; README "Deploy" |
| 7.2 | Testing & QA | 4 | Test suite, a test run or CI log, and QA agent output | A few tests, not run or no results shown | Automated tests present and run, with QA agent output or results shown | Good, with tests covering edge cases and the jury's inputs; results repeatable | `docs/TEST-EVIDENCE.md`; CI runs |
| 7.3 | Security | 3 | Secrets-scan result; how credentials are stored; how access is controlled (login, roles) | No secrets in code, but credentials handled informally | No secrets in repo; credentials in env vars or a secret store; access controlled | Good, plus least-privilege access and a documented authentication model | `docs/SECURITY.md`; `docs/SPEC-auth.md` |
| 7.4 | Gaps & roadmap | 3 | Limitations and roadmap slide or document: known gaps, and the steps and effort to reach production | Limitations listed but vague; no path to production | Honest list of known limitations and what is needed to reach production | Good, plus a prioritised roadmap that includes handling 10× load | `docs/ROADMAP.md` |
| | **Total** | **100** | | | | | |

Below avg (under 40%) for every criterion: the evidence is missing, or shows it does not work (crash, wrong output,
secrets in the repo).

## Submission checklist

| # | Requirement | Where |
|---|---|---|
| 1 | Source code in the team's GitHub repo, with a README that explains how to set up and run it | GitHub |
| 2 | Discovery doc (MD) covering the problem, users, requirements and scope | GitHub (`docs/DISCOVERY.md`) |
| 3 | Agent instruction files (MD) for the dev, DevOps and QA agents (`.claude` / `.copilot` folders) | GitHub (`.claude/agents/`) |
| 4 | Working demo video showing the end-to-end flow | SharePoint, linked in the README |
| 5 | PPT (optional) | SharePoint |
