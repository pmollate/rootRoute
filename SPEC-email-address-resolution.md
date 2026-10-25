# SPEC — Email Order Intake & Address Resolution

**Project:** Halcyon · **Version:** 1.0 · **Status:** Build-ready (hackathon)

## 1. Goal

Turn any free-format order email into a portal order with a verified delivery address, without manual keying and without asking the customer to resend.

| Metric | Today | Target |
|---|---|---|
| Email orders with incomplete address | 27.8% | ≤ 5% |
| Orders keyed manually | ~100% of email | 0% (staff touch exceptions only) |
| Customer emails needed per order | 1–2+ | 1 (+ one tap when unsure) |
| `received_at` source | Keying time | Email arrival time |

**Out of scope:** stock allocation (step 15, separate spec), carrier selection, portal UI redesign.

## 2. Principles

1. **Never bounce an email.** Accept any format; ask only for the missing field.
2. **Cheapest step first.** Rules → saved addresses → small LLM → geocoder → large LLM.
3. **Pause shipping, not the order.** Low address confidence holds only dispatch; stock is reserved and picking starts.
4. **Idempotent everywhere.** One email = at most one order.
5. **Every decision is logged** with inputs, scores and reason.

## 3. Flow

```
Inbox ─▶ Queue ─▶ Ingest ─▶ Normalize ─▶ Rules ─▶ LLM extract ─▶ Validate
                                                                    │
     ┌──────────────────────────────────────────────────────────────┘
     ▼
 Address clean ─▶ Saved-address match ──hit──────────────┐
                        │ miss                           ▼
                        └▶ Geocode ─▶ Confidence score ─▶ ROUTE
                                                          │
          ┌─────────────────────┬─────────────────────────┤
          ▼                     ▼                         ▼
      ALL_CLEAR          CONFIRM_ADDRESS             MISSING_INFO
   create order          create order (dispatch     hold order, ask one
   + ack email           held) + magic link         question in thread
                         │ confirmed → release      │ reply → re-ingest
                         │ timeout → CS queue       │ no reply 4h → CS queue
```

## 4. Stack

| Concern | Tool |
|---|---|
| Inbox + trigger | Exchange Online mailbox, Microsoft Graph change notifications |
| Queue | Azure Service Bus (`email-inbound`, `email-process`, DLQ) |
| Workers | Azure Functions — TypeScript (ingest, orchestration), Python (rules, scoring) |
| Timers | Azure Durable Functions |
| Attachments | Azure AI Document Intelligence (`prebuilt-layout`) |
| Extraction | Azure OpenAI — small model default, large model on escalation |
| Geocoding | Azure Maps Search (address geocoding) |
| Confirm page | Next.js page + Azure Maps Web SDK |
| Outbound email | Azure Communication Services Email |
| Data | Azure Database for PostgreSQL (with `pg_trgm`), Azure Blob Storage |
| Secrets / auth | Key Vault + Managed Identity |
| Observability | Application Insights (correlation id = `message_id`) |

## 5. Components

Each component reads one message, writes its result, and enqueues the next step. All are idempotent on `message_id`.

### 5.1 Inbox trigger
- Graph subscription on `orders@` → webhook → enqueue `{message_id}` to `email-inbound`.
- Store raw `.eml` + attachments in Blob at `raw/{yyyy}/{mm}/{dd}/{message_id}/`.
- `received_at` = Graph `receivedDateTime` (UTC). Never overwritten.
- Renew the Graph subscription on a timer before it expires.

### 5.2 Ingest worker (TS)
| Check | Rule |
|---|---|
| Duplicate | `message_id` exists in `intake` → ack and stop |
| Thread | `In-Reply-To` / `References` matches an intake with an order → attach as reply, jump to §5.10 |
| Client | Exact sender email in `client_contacts` → else domain in `client_domains` (skip free-mail domains) → else `client_id = null` |

Output: `intake` row, status `received`.

### 5.3 Normalize
- HTML → text; strip signatures and quoted history (keep only the newest message body).
- Attachments (PDF, image, XLSX/CSV) → Document Intelligence → text + tables. Cap: 10 pages per email.
- Output: `normalized_text`, `tables[]` saved to `intake`.

### 5.4 Rules pre-pass (Python)
Deterministic, zero cost. Pre-fills fields the LLM must respect.

| Field | Pattern |
|---|---|
| PIN code (IN) | `\b[1-9][0-9]{5}\b` |
| Phone (IN) | `(?:\+91[\s-]?)?[6-9]\d{9}` |
| SKU | catalog SKU regex + exact alias lookup |
| Quantity | number adjacent to a matched SKU / unit word |
| Date | dateparser, `DD/MM` preferred |

### 5.5 LLM extract
- Model: small by default. Temperature 0. Structured output against the schema in §6.
- Prompt includes: normalized text, tables, rules pre-pass hits, client's top 20 SKUs.
- Escalate to the large model once if `confidence < 0.70` or the schema fails to validate. Max 2 calls per email.
- Store model, tokens, latency and output in `extraction_log`.

### 5.6 Validate
| Check | Fail result |
|---|---|
| `client_id` resolved | MISSING_INFO (`client`) |
| ≥ 1 item | MISSING_INFO (`items`) |
| Each item → SKU: exact code → alias → `pg_trgm` similarity ≥ 0.6, single best match with ≥ 0.1 gap to 2nd | MISSING_INFO (`sku:<line>`) with top-2 candidates |
| Qty 1 ≤ q ≤ 3× client's max historical qty for that SKU | MISSING_INFO (`qty:<line>`) |
| Same client + same SKUs/qty + same address within 48h | flag `possible_duplicate`, route CONFIRM_ADDRESS |

### 5.7 Address clean
- Expand abbreviations (`Rd → Road`, `Opp → Opposite`, `Nr → Near`), collapse whitespace, title-case.
- Split into `line1` (building/house no.), `line2`, `landmark`, `city`, `state`, `pin`.
- Build `addr_key` = lowercase, punctuation-stripped `line1|line2|pin` for matching.

### 5.8 Saved-address match
```sql
SELECT id, lat, lng, similarity(addr_key, $1) AS sim
FROM client_addresses
WHERE client_id = $2 AND pin = $3
ORDER BY sim DESC LIMIT 1;
```
- `sim ≥ 0.90` → **hit**: reuse `lat/lng`, `address_score = 1.0`, skip geocode.
- Otherwise → §5.9.

### 5.9 Geocode + confidence score
Call Azure Maps once with the full cleaned address, country `IN`, top 3 results.

**HIGH** if all true, else **LOW**:

| Condition | Value |
|---|---|
| Top result score | ≥ 0.90 |
| Result type | address point / house number level (not street, locality or postcode centroid) |
| PIN in result = PIN in email | equal |
| 2nd result | absent, or > 200 m from the 1st |
| House/building number | present in input |

No result → LOW with `reason = not_found`.

### 5.10 Router

```ts
type Route = "ALL_CLEAR" | "CONFIRM_ADDRESS" | "MISSING_INFO";

function route(v: Validation, a: Address): Route {
  if (v.missing.length) return "MISSING_INFO";
  if (v.possibleDuplicate) return "CONFIRM_ADDRESS";
  if (a.source === "saved" || a.confidence === "HIGH") return "ALL_CLEAR";
  return "CONFIRM_ADDRESS";
}
```

Replies (from §5.2) re-run §5.3–5.10 on the merged thread and update the existing order instead of creating a new one.

### 5.11 Actions

| Route | Order status | Stock | Email to customer |
|---|---|---|---|
| ALL_CLEAR | `confirmed` | allocate + pick | Ack: order no., items, delivery date |
| CONFIRM_ADDRESS | `pending_address` | allocate + pick, **dispatch held** | Magic link to confirm address |
| MISSING_INFO | `on_hold` | none | One question for the first missing field |

All emails reply in the same thread (`In-Reply-To` = original `message_id`).

## 6. Extraction schema

```json
{
  "type": "object",
  "required": ["items", "ship_to", "missing", "confidence"],
  "properties": {
    "client_name":    { "type": ["string", "null"] },
    "contact_name":   { "type": ["string", "null"] },
    "contact_phone":  { "type": ["string", "null"] },
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["text", "qty"],
        "properties": {
          "sku":  { "type": ["string", "null"] },
          "text": { "type": "string" },
          "qty":  { "type": "integer", "minimum": 1 }
        }
      }
    },
    "ship_to": {
      "type": "object",
      "properties": {
        "name": { "type": ["string", "null"] },
        "line1": { "type": ["string", "null"] },
        "line2": { "type": ["string", "null"] },
        "landmark": { "type": ["string", "null"] },
        "city": { "type": ["string", "null"] },
        "state": { "type": ["string", "null"] },
        "pin": { "type": ["string", "null"] }
      }
    },
    "requested_date": { "type": ["string", "null"], "format": "date" },
    "same_day":   { "type": "boolean" },
    "missing":    { "type": "array", "items": { "type": "string" } },
    "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
  }
}
```

LLM rules: never invent values — use `null` and list the field in `missing`. Copy address text verbatim; cleaning happens in §5.7.

## 7. Data model

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE client_contacts (email text PRIMARY KEY, client_id int NOT NULL);
CREATE TABLE client_domains  (domain text PRIMARY KEY, client_id int NOT NULL);

CREATE TABLE client_addresses (
  id serial PRIMARY KEY, client_id int NOT NULL,
  line1 text, line2 text, landmark text, city text, state text, pin char(6),
  addr_key text NOT NULL, lat double precision, lng double precision,
  source text NOT NULL,            -- 'confirmed' | 'delivered' | 'cs'
  last_used_at timestamptz, created_at timestamptz DEFAULT now()
);
CREATE INDEX ON client_addresses USING gin (addr_key gin_trgm_ops);
CREATE INDEX ON client_addresses (client_id, pin);

CREATE TABLE catalog_aliases (alias text, sku text, client_id int NULL);
CREATE INDEX ON catalog_aliases USING gin (alias gin_trgm_ops);

CREATE TABLE intake (
  message_id text PRIMARY KEY, thread_root text, client_id int,
  received_at timestamptz NOT NULL, blob_path text NOT NULL,
  normalized_text text, status text NOT NULL,   -- received|processed|failed
  order_id int, created_at timestamptz DEFAULT now()
);

CREATE TABLE extraction_log (
  id serial PRIMARY KEY, message_id text, model text, attempt int,
  output jsonb, confidence real, tokens_in int, tokens_out int, latency_ms int,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE route_decisions (
  id serial PRIMARY KEY, message_id text, order_id int, route text,
  address_source text, address_score real, geocode_raw jsonb,
  missing text[], reason text, created_at timestamptz DEFAULT now()
);

CREATE TABLE confirm_tokens (
  token_hash char(64) PRIMARY KEY, order_id int NOT NULL,
  expires_at timestamptz NOT NULL, used_at timestamptz
);
```

`orders` (existing portal table) gains: `source`, `received_at`, `intake_message_id`, `address_id`, `dispatch_hold boolean`, `route`.

## 8. Order states

```
received ─┬─▶ confirmed ───────────────────────────▶ ready_to_dispatch ─▶ dispatched
          ├─▶ pending_address ─(confirmed)─────────▶ ready_to_dispatch
          │         └─(timeout)─▶ cs_review ─(fixed)─▶ ready_to_dispatch
          └─▶ on_hold ─(reply)─▶ re-route
                    └─(no reply 4h)─▶ cs_review
```

## 9. Magic link

| Item | Spec |
|---|---|
| URL | `https://<portal>/confirm/{token}` |
| Token | 32 random bytes, base64url; store SHA-256 only |
| Lifetime | 24h or order cutoff − 2h, whichever is sooner; single use |
| Page | Pre-filled address fields + draggable map pin; buttons **Confirm** / **Save changes** |
| Pin moved > 500 m or PIN edited | Reverse-geocode, show the result, require a second Confirm |
| On submit | Mark token used · upsert `client_addresses` (`source='confirmed'`) · set `address_id` · `dispatch_hold=false` · status `ready_to_dispatch` |
| Abuse | 10 req/min per IP · token scoped to one order's address only · no other order data shown |

## 10. Timers (Durable Functions)

| Trigger | Fires | Action |
|---|---|---|
| Magic link sent | 4h, no confirm | One reminder email |
| Magic link sent | cutoff − 2h, no confirm | Status `cs_review`, add to CS queue |
| Question sent (MISSING_INFO) | 4h, no reply | Status `cs_review`, add to CS queue |
| Any timer | Order confirmed / replied | Cancel |

## 11. Email templates (plain, same thread)

**Ack (ALL_CLEAR):** "Order {no} received: {items}. Delivering to {address} by {date}."

**Confirm (CONFIRM_ADDRESS):** "Order {no} is being packed. Please confirm the delivery address so we can ship: {link}. It takes one tap."

**Question (MISSING_INFO)** — one per email, first missing field:
- `client`: "Which company is this order for?"
- `sku`: "For '{text}', did you mean {A} or {B}?"
- `items`: "We couldn't find the items in your email. Could you list them with quantities?"
- `qty`: "Please confirm the quantity for {sku}: {qty}?"

## 12. Errors & retries

| Failure | Handling |
|---|---|
| Any worker exception | Service Bus retry ×5, exponential backoff → DLQ → CS queue with reason |
| Azure OpenAI 429/5xx | Retry ×3, then leave in queue and alert (don't send a question for a system fault) |
| Azure Maps error / timeout | Treat as LOW → CONFIRM_ADDRESS (never block) |
| Document Intelligence fails | Continue with body text only; log |
| Outbound email fails | Retry ×3; then CS queue |

## 13. Security & privacy

- Managed Identity between all services; keys in Key Vault only.
- Raw emails in Blob: private container, 90-day retention.
- Redact phone numbers and emails from logs except `message_id`.
- Process only mail sent to `orders@`; ignore auto-replies (`Auto-Submitted` header) and bounces.

## 14. Config (env, tunable)

```env
LLM_ESCALATE_BELOW=0.70
LLM_MAX_CALLS=2
SAVED_ADDR_MIN_SIM=0.90
SKU_MIN_SIM=0.60
SKU_MIN_GAP=0.10
GEO_MIN_SCORE=0.90
GEO_SECOND_RESULT_MIN_M=200
PIN_MOVE_RECONFIRM_M=500
TOKEN_TTL_HOURS=24
CUTOFF_BUFFER_HOURS=2
REMINDER_HOURS=4
QUESTION_TIMEOUT_HOURS=4
DUPLICATE_WINDOW_HOURS=48
```

## 15. Metrics (App Insights dashboard)

- Route split: % ALL_CLEAR / CONFIRM_ADDRESS / MISSING_INFO
- Saved-address hit rate (should rise week over week)
- Median time email → order created; email → address confirmed
- Field-level extraction accuracy on the labelled set
- LLM escalation rate and cost per email
- CS queue volume and age

## 16. Test plan

**Labelled set:** 30 synthetic emails covering clean text, forwarded thread, PDF purchase order, Excel order, photo of a handwritten list, address with landmark only, wrong PIN, ambiguous SKU, unknown sender, duplicate send, and a reply to a question.

| Test | Pass |
|---|---|
| Same email delivered twice | 1 order |
| Reply to MISSING_INFO question | Updates existing order, no new order |
| Known client, saved address | ALL_CLEAR, no geocode call |
| Landmark-only address | CONFIRM_ADDRESS |
| Maps API down | CONFIRM_ADDRESS, no crash |
| Token reused / expired | Rejected |
| No confirm by cutoff − 2h | In CS queue |
| Field accuracy on labelled set | ≥ 90% items, ≥ 95% PIN |

**Demo output:** route split on the 30 emails, e.g. "X% all clear · Y% one-tap confirm · Z% missing info," and the incomplete-address rate before vs after.

## 17. Build order

1. Tables + ingest + rules pre-pass (no AI) — end-to-end with a stub router.
2. LLM extract + validate + labelled-set accuracy script.
3. Saved-address match + geocode + scoring + router.
4. Portal order creation + ack email.
5. Magic link page + timers + CS queue view.
6. Metrics dashboard + demo run.
