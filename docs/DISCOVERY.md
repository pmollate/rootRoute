# Discovery: problem, users, requirements and scope

One-page summary of what we found and what we agreed to build. Every figure is computed from the supplied dataset
(`Halcyon-Hackathon-Dataset/`, 48,340 deliveries, orders 1 Apr – 25 Sep 2026); the detail and method behind each line
is in [`SPEC.md`](SPEC.md), cited per section.

## 1. The problem

Halcyon Logistics (280 clients, 5 warehouses, 6 carriers) delivers **71.0% on time** against a 94% industry benchmark,
flat every month (70.3–71.5%). Leadership believes carrier routing is the cause and is two weeks from signing a
**$680K routing-engine contract**.

The data says the cause is mostly elsewhere. Five causes explain every late delivery (SPEC §2.2), and **67% of late
deliveries have a cause before a truck is booked**: an incomplete address, a same-day order after the 08:00 cut-off,
or a shipment from a warehouse that is not the nearest. Carrier problems are real but sit in five lanes and on carrier
D's Fridays; they account for 7.6 of the 29.0 points of on-time lost.

## 2. Baseline: the size of the problem today

| Measure (6 months) | Today | Source |
|---|---|---|
| On-time rate | **71.0%** (14,019 late deliveries) | SPEC §2.1 |
| SLA penalties paid | **$872,460** (4,847 × $180) | SPEC §2.1 |
| Late-delivery handling cost | **$476,646** (14,019 × $34) | SPEC §2.1 |
| Failure cost vs freight | $1.35M against $738K freight: **1.8× the freight bill** | SPEC §2.1 |
| Customer success time on complaints | **64%** of hours; 12 of 34 complaints say "nobody told us" | SPEC §2.1 |
| At-risk accounts | **9 accounts worth $14.2M a year**, 7 of them Tier 1 | SPEC §2.1 |
| Email orders with an incomplete address | **27.8%** (vs 5.3% API, 5.2% EDI) | SPEC §2.1 |

## 3. Target users and their pain points

| User (role in the app) | Pain point today (from the data and the sponsor's answers) | What Root Route gives them |
|---|---|---|
| Order desk (`order_desk`) | Email orders are keyed by hand; 27.8% arrive with an incomplete address, found only when a delivery fails | AI reads each email into checked JSON; code flags the gap and drafts the question to the client; a person approves before the WMS |
| Warehouse supervisor (`warehouse_supervisor`) | 4,826 same-day orders after the 08:00 cut-off are promised same day anyway (61% late); 691 orders skip a nearest warehouse that had stock | Cut-off-aware promise, nearest-warehouse rule, weekly stock moves, penalty reconciliation (2,002 unpaid) |
| Carrier manager (`carrier_manager`) | Carriers are picked from a preference spreadsheet that "reflects habit, not performance" (Q-003); preferred carrier F is 54–57% on time in two regions | Lane scorecards on fair data, a recommended carrier with override, a Friday cap on D |
| Customer support (`customer_support`) | 64% of hours on complaints; clients learn of delays from their own customers (Q-004) | Each complaint linked to its delivery and cause, with a drafted response; at-risk and Tier 1 first |
| Leadership (`leadership`, read-only) | A $680K decision with no stage-level cause data | Causes ranked by points lost, each fix's replayed effect, and "Ask LateLens" answers from read-only tools. The decision stays with Halcyon |

## 4. Business reason

Each late delivery costs $34 in handling, plus $180 when the client has a penalty clause. Replaying the
supplied deliveries with the fixes Root Route builds lifts on-time from **71.0% to 85.9%** (expected adoption) and
avoids about **$708K** of cost in 6 months; the full programme reaches **92.0%** and about **$981K** (SPEC §2.4). The
routing engine's best case on the same data is **80.4%** (lanes + routes, full fix). Before/after detail and method:
[`IMPACT.md`](IMPACT.md).

## 5. Sponsor and user input

29 questions are logged with who answered and what each changed ([SPEC §14.1](SPEC.md)), including six answered by
Halcyon's business through the organisers' question log:

| Question | Halcyon's answer | What it changed |
|---|---|---|
| Who sets `commitment_type` and `promised_date`? (Q-001) | The client chooses; the system sets the date | The cut-off promise rule (REQ-PRO, SPEC §5.4) |
| Does the WMS have an API; may we simulate it? (Q-002) | Yes; simulate order entry and pick lists | WMS entry bot and simulator (E13) |
| Is `carriers.csv` the preference spreadsheet? (Q-003) | No; preferences reflect habit, infer them from deliveries | Lane scores and the backtest baseline from `deliveries.csv` |
| How do clients hear about delays? (Q-004) | Only by chasing; no proactive updates | Client alerts, at-risk accounts first (E14) |
| Is email `order_received_ts` arrival or keying time? (Q-005) | Keying time | Cut-off analysis treats it as when the order entered the process |

Open questions still waiting for an answer (carrier capacity, the vendor's proof of concept, unpaid penalties) are in
SPEC §12 and §14; each is a visible `[PLACEHOLDER]` wherever it would change a number.

## 6. Requirements

| Kind | Where | Count |
|---|---|---|
| Functional (`REQ-*`), each with an acceptance criterion (`AC-*`) | SPEC §5 (per module), SPEC-auth §7.1, SPEC-order-workflow, SPEC-data-upload | 147 |
| Non-functional (`NFR-*`) | SPEC §8, SPEC-auth §7.2 and the module specs | 19 |
| Security (`SEC-*`) | SPEC §8, SPEC-auth §7.3, §5.17 | 45 |
| Assumptions and open questions | SPEC §12 (with the synthetic data register §12.1) | |
| Constraints | SPEC §3.2 | |
| Out of scope | SPEC §3.1 (OS-01 … OS-13) | |
| Edge cases, each with where it is handled and its test | SPEC §9.4 | |

**Requirement → feature → test map:** [`TRACEABILITY.md`](TRACEABILITY.md), generated from the SPEC files and the
test files (`python3 scripts/traceability.py`).

## 7. Scope

- **Core (must work at submission):** diagnostic engine and cause attribution, replay, carrier lane scores and
  recommendation, email intake with address check and approval, cut-off and nearest-warehouse rules, complaint triage,
  Ask LateLens over MCP, the dashboard screens, CI/CD to Azure (SPEC §3).
- **Synthetic (built on generated data, badged in the UI):** API/EDI address checks, stock placement, carrier
  tracking, mailbox simulator (SPEC §3, §12.1).
- **Out of scope (SPEC §3.1, OS-01 … OS-13):** making Halcyon's business decisions (no sign/don't-sign verdicts),
  modelling a routing vendor's product, building a routing engine, writing to a live WMS, live carrier feeds, email
  outside the test allow-list, real personal data, and synthetic data in any headline figure.
