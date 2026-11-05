# Pitch script: Root Route (LateLens)

Spoken script for the demo and presentation. It follows the organisers' required order, the same order as the deck
at `/present` (`frontend/components/present/slides.tsx`, `SECTIONS`):

1. Discovery insights & the key problem
2. Solution approach & architecture diagram
3. AI agents used
4. Quality, validation & security
5. Metrics & business impact
6. Future scope
7. Live demo: show it running on AI, end to end

Three speakers, one per problem area (SPEC §10): **Carriers** (C), **Email** (E), **Warehouse** (W). The speaker
for each slide is the one set in the deck. Timings assume about 9 minutes: about 6 for sections 1–6 and 3 for the
live demo. The time limit is `[TIME_LIMIT]` (not confirmed). If it is shorter, cut the optional lines marked *(opt)*
first.

Every figure comes from `frontend/config/present.ts`, SPEC §2 and `docs/IMPACT.md`, all computed from the supplied
dataset (48,340 deliveries, 1 Apr – 25 Sep 2026). Before the pitch, run the `numbers-auditor` agent so the deck, the
dashboard and this script agree.

Tone rule (CLAUDE.md): we show what Halcyon's data says and stop there. We never tell them to sign or not sign the
routing contract. Say "the data shows", not "you should".

---

## Opening (C) · slides: Title, Agenda · 0:00 – 0:15

> We're Root Route. In the next few minutes: what we found, what we built, how we checked it, what it's worth, and
> then the app running live on the AI model.

## 1. Discovery insights & the key problem (C) · slides: The belief, What lateness costs, Discovery, Five causes, Before pickup · 0:15 – 1:45

**The belief**
> Halcyon delivers on time 71% of the time. The benchmark is 94%. Leadership believes carrier routing is the cause,
> and they are two weeks from a $680,000 routing-engine contract.

**What lateness costs**
> Lateness costs Halcyon $1.35 million in six months: $872,460 in SLA penalties and $476,646 in handling. That is
> 1.8 times their whole freight bill.

**Discovery**
> Before building anything, we asked questions: 38 of them, to the data, to Halcyon through the organisers' question
> log, and to each other. Each one is logged with the answer and what it changed. Two changed the product most.
> First: is routing really the cause? The data says 67% of late deliveries have a cause before pickup. Second: is
> carrier D bad everywhere? No. D is reliable except on Fridays, when it carries 39% of the volume. That's a capacity
> problem, so the fix is a Friday cap, not a block.

**Five causes**
> Five causes explain every late delivery. Not most: every one. A delivery with none of them was never late. Of the
> 29 points between 71% and 100%, carrier lanes cost 7.6. An incomplete address costs 7.0. A same-day order after the
> 8am cut-off costs 5.6. Shipping from a warehouse that isn't the nearest costs 5.6. Routes more than 20% over plan
> cost 3.2.

**Before pickup**
> So the key problem: three quarters of Halcyon's lateness starts before a truck is even booked. And 28 of the 34
> complaints are about one of those deliveries.

## 2. Solution approach & architecture diagram (C) · slides: Solution approach, Email orders, Warehouse and promise, Carriers, Workflow, Architecture · 1:45 – 3:00

**Solution approach**
> Our approach is to fix each cause where it starts, then replay the fix on the same deliveries to measure it. One
> problem area per teammate: email orders, warehouse and promise, and carriers.

**Email orders** (E, 10 s)
> 27.8% of email orders arrive with an incomplete address, and today nobody finds out until the delivery fails. We
> catch it at intake and ask the client before the 8am pick list.

**Warehouse and promise** (W, 10 s)
> 4,826 same-day orders came in after 8am, and 61% of them were late. After the cut-off, we promise next day. And
> we flag the 691 orders that skipped a nearest warehouse that had stock.

**Carriers** (C, 15 s)
> Today's scorecards make carriers A, B and C look 75.3% on time, because they blame carriers for orders that were
> late before pickup. On fair data, deliveries with none of those causes, they're 95.2%. Five lanes stand out, and
> five lane rules plus a Friday cap reach them.

**Workflow and Architecture**
> One rule shapes the architecture: Python computes, Node looks up. The Python pipeline reads Halcyon's data and
> writes every number to PostgreSQL. The Fastify API only looks those numbers up and applies order-time rules, so the
> replay and the live app can't disagree. The Next.js dashboard signs people in with Entra ID and calls the API
> through a proxy. Everything runs on Azure: App Service, Postgres, Key Vault, Azure OpenAI, Azure Maps and Azure AI
> Language.
>
> *(opt)* We used rules where rules are enough. Our team's LightGBM model scores well, but rules are explainable to an
> operator and testable to exact counts.

## 3. AI agents used (E) · slide: AI agents · 3:00 – 3:45

> Every agent follows one rule: the model proposes, code checks, a person decides.
>
> The **intake agent** turns a messy email into order JSON and drafts the reply. It gets no tools, and a supervisor
> approves every order before the warehouse system. **Complaint triage** finds the cause of a late delivery and
> drafts the response. A person sends it. **Ask LateLens** lets leadership ask the data from Claude over MCP, using
> six read-only tools. No tool can send, approve or write.
>
> Agents also built the product. Each area went spec, then plan, then test-first build, then review, with agents in
> separate roles: spec writer, planner, implementer, reviewer, numbers auditor, QA and more. Their run records are in
> the repo.

## 4. Quality, validation & security (E) · slide: Quality and security · 3:45 – 4:30

> Every headline number is asserted by a test. A fresh clone, following only the README, passes 740 of 740 tests.
>
> We grade the AI with code, not with another model. On our 50 synthetic test emails, 49 get the right decision
> (the gate is 48), all 245 fields are right, and all 10 incomplete addresses are caught. An email that says "ignore
> previous instructions" never becomes ALL_CLEAR.
>
> Security: Entra ID sign-in with six roles, and the API refuses any route it doesn't list. Personal details are
> removed before the model sees an email. Secrets live in Key Vault, and the deploy signs in to Azure with OIDC, so no
> password is stored. The secrets scan finds no leaks in the git history. Outbound mail goes only to an allow-list.

## 5. Metrics & business impact (W) · slides: Replay, Same data different fixes, Before and after · 4:30 – 5:30

**Replay**
> The replay switches each fix on, one at a time, over the same 48,340 deliveries, at a realistic adoption rate.
> *(Step through.)* Address check: 76.2%. Lane rules and Friday cap: 82.5. Cut-off promise: 87.3. Warehouse
> fallback: 91.0. And if 30% of route overruns were cut (an assumption: no fix is built for that yet): 92.0% on time. That's 10,150 fewer late deliveries and about $981,000 avoided in
> six months.

**Same data, different fixes**
> What we built this week reaches 85.9% on its own. For comparison, on the same data and the same method, fixing
> every carrier lane and every route overrun, perfectly, reaches 80.4%.

**Before and after**
> In Halcyon's own KPIs: late deliveries go from 14,019 to 6,828 with what we built. Handling plus penalties go from
> $1.35 million to about $641,000. The gap to the 94% benchmark goes from 23 points to 8.1.

## 6. Future scope (W) · slide: Future scope · 5:30 – 6:00

> Next, in three steps. Now, in two to three weeks: run on Halcyon's own data, with upload and validation. Next, in
> one to two months: an 8-week pilot with treatment and control warehouses and a stop rule at week 4, plus daily
> sync and production hosting. Later: a second client on the same platform.
>
> The replay also shows what's left on the table. Add address checks on API and EDI orders, and fix nearest-warehouse
> stock-outs, and what we built reaches 96.3%.

## 7. Live demo: running on AI, end to end (E leads) · slide: Live demo, then the deployed app · 6:00 – 9:00

Switch to **rootroute.in/dashboard**, signed in with a demo account. Email orders run on the real Azure OpenAI model.

| # | Screen | What to show and say | Who | AI |
|---|---|---|---|---|
| 1 | Overview | Five causes, 67% before pickup, 28 of 34 complaints. "Same numbers as the slides, computed from the data." | C | |
| 2 | Carriers | Five bad lanes on fair data; D fails only on Fridays | C | |
| 3 | Order emails | C190's messy email. "It's synthetic and labelled as such." Process it: the model's JSON next to the code's address check. "The model reads. Code decides." | E | ✓ |
| 4 | Order emails | The agent drafts the address request → the client replies → ALL_CLEAR | E | ✓ |
| 5 | Order emails | **The judges' email.** "Would one of you like to write an order email, with something missing?" Paste it in and process it live. | E | ✓ |
| 6 | Order emails | **A bad input.** Put `orders` in From: the form says "From must be an email address, like orders@client190.example." Nothing is stored and no AI is called. *(opt)* An empty body keeps **Process email** disabled. | E | |
| 7 | Order review | The supervisor approves; the order goes to the WMS. "Nothing reaches the warehouse without a person." | E | |
| 8 | Complaints | One complaint triaged: cause found, response drafted | E | ✓ |
| 9 | Warehouses | Cut-off promise and nearest-warehouse stock *(opt if short on time)* | W | |
| 10 | Replay | The programme, step by step: 71.0% → 92.0% *(skip if already shown in section 5)* | W | |
| 11 | Claude + LateLens | Ask: "Which carrier lanes should we stop using, and why?" The answer quotes the numbers just shown | C | ✓ |

*If the live AI call fails: switch to `LLM_PROVIDER=recorded` and say "these are recorded model responses".*

## Close (E) · slide: Close · 9:00

> Three quarters of Halcyon's lateness starts before pickup. Carrier lanes are a real problem, and five rules reach
> them. Root Route shows Halcyon where each point of on-time goes, what fixes it, and what the replay says it's
> worth. The decisions stay with Halcyon. Thank you.

---

## 60-second version

> Halcyon is 71% on time against a 94% benchmark and is about to spend $680K on routing. We read all 48,340
> deliveries. Five causes explain every late one, and three quarters of the lateness starts before pickup: incomplete
> addresses, orders after the 8am cut-off, and shipping from the wrong warehouse. Carriers matter on five specific
> lanes, and on Fridays for carrier D.
>
> Root Route catches incomplete addresses in email orders with an AI reader and a code check, keeps promises honest
> after cut-off, flags the nearest warehouse, and replaces the carrier spreadsheet with five lane rules and a Friday
> cap. Replayed on their own deliveries, what we built takes them to 85.9%, and the full programme to 92%, about
> $981K avoided in six months. The best case for carrier lanes and routes alone is 80.4%.

---

## Q&A crib

| Question | Answer (with source) |
|---|---|
| Is your data real? | Headline figures and the replay use the supplied dataset only. Email orders, complaints and tracking events in the demo are synthetic, generated from the supplied ids and dates, and badged "Synthetic data" (SPEC §12.1). |
| Isn't "every late delivery has a cause" too clean? | Yes, the synthetic data is cleaner than real life. That's why the roadmap starts with an 8-week pilot with a stop rule at week 4 (SPEC §9.2, `docs/ROADMAP.md`). |
| So should they cancel the routing contract? | That's Halcyon's decision. We show what the data says: fixing every carrier lane and route overrun reaches 80.4% at best; route detours alone cost 3.2 points. |
| How do you avoid double counting? | Late deliveries with two causes are shared between them (Shapley), so the five causes add up to exactly 29.0 points (`docs/IMPACT.md` §2.2). |
| Where does the AI decide things? | It doesn't. The model reads emails, drafts replies and answers questions from read-only tools. Code makes the decision; an operator approves every order before the WMS. |
| What if the email contains instructions to the AI? | Email is untrusted input. The model has no tools in the intake, its output is checked by code, and outbound mail goes only to an allow-list (SPEC §8). The injection test email never reaches ALL_CLEAR. |
| Why rules and not your ML model? | Rules are explainable to an operator, testable to exact counts and demo-reliable. The LightGBM model stays phase 2 (`docs/ARCHITECTURE.md` §5, decision 1). |
| What breaks at 10× volume? | See `docs/SCALE-RUN.md` and `docs/ROADMAP.md` §3: the full rebuild per run and the in-process cache are the first limits. |
| What would change your mind? | A pilot moving less than 5 points in 4 weeks; carrier data showing post-pickup delays are bigger than here; carriers A, B, C, E unable to absorb D and F's volume (SPEC §1.2). |
| How did you get the cost figure? | $34 handling per late delivery avoided + $180 penalty for clients with a penalty clause × 0.708, the share actually paid (SPEC §1.1). |
| Adoption rates? | Assumed per fix: address 85%, lanes 90%, cut-off 85%, warehouse 60%, route overruns 30% (assumed; no fix built). The full-fix upper bound for as built is 88.5%. |

## Before you go on

- [ ] `numbers-auditor` run; deck, dashboard and this script match
- [ ] Deployed app warm; signed in with a demo account; C190 email reset
- [ ] A blank paste form ready for the judges' email; the bad-input case rehearsed
- [ ] Recorded-responses fallback tested
- [ ] Ask LateLens connector signed in on the demo laptop
- [ ] Deck open at `/present`, speaker notes checked (N)
- [ ] Each speaker has rehearsed their hand-off line
