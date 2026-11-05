import type { CSSProperties, ReactNode } from 'react';
import { BrandMark } from '@/components/ui/BrandMark';
import {
  AS_BUILT,
  BAD_LANES,
  CARRIERS,
  CAUSES,
  COMPARISON,
  DATASET,
  EMAIL,
  HEADLINE,
  KPIS,
  LINKS,
  NO_CAUSE,
  PROGRAMME,
  PROGRAMME_RESULT,
  WAREHOUSE,
  fmt,
  usd,
} from '@/config/present';

/** Speakers by problem area (SPEC §10): Carriers, Email, Warehouse. */
export type Speaker = 'Carriers' | 'Email' | 'Warehouse';

export type Slide = {
  id: string;
  /** short name for the progress rail and the print header */
  title: string;
  speaker: Speaker;
  /** speaker notes, shown with N */
  notes: string[];
  body: ReactNode;
  /** 1–7: the organisers' required section (SECTIONS); none for the title and close */
  section?: number;
};

/** The order the organisers asked for. */
export const SECTIONS = [
  'Discovery insights & the key problem',
  'Solution approach & architecture',
  'AI agents used',
  'Quality, validation & security',
  'Metrics & business impact',
  'Future scope',
  'Live demo, end to end on AI',
];

/** stagger index for build-in animation */
const d = (i: number) => ({ '--d': i } as CSSProperties);
const w = (pct: number) => ({ '--w': `${pct}%` } as CSSProperties);

function Kick({ children }: { children: ReactNode }) {
  return (
    <p className="p-kick in" style={d(0)}>
      <span className="p-kick-dot" aria-hidden="true" />
      {children}
    </p>
  );
}

const pts = (n: number) => n.toFixed(1);

/* ───────── 5 causes: a 0–100 bar, on time then the 29 points lost ───────── */
function CauseBar() {
  return (
    <div className="p-causebar in" style={d(2)} role="img" aria-label="71.0% on time; 29.0 points lost to five causes">
      <span className="p-seg p-seg-ok" style={w(HEADLINE.onTime)}>
        <b>{pts(HEADLINE.onTime)}%</b> on time
      </span>
      {CAUSES.map((c, i) => (
        <span
          key={c.key}
          className={`p-seg p-seg-cause ${c.beforePickup ? 'is-pre' : 'is-post'}`}
          style={{ ...w(c.points), ...d(3 + i) }}
          title={`${c.label}: ${pts(c.points)} points`}
        >
          {pts(c.points)}
        </span>
      ))}
    </div>
  );
}

/* ───────── replay: one column per step ───────── */
function StepChart() {
  const lo = 60;
  const h = (v: number) => ((v - lo) / (100 - lo)) * 100;
  return (
    <div className="p-steps in" style={d(2)}>
      <span className="p-steps-bench" style={{ '--b': h(HEADLINE.benchmark) / 100 } as CSSProperties}>
        94% benchmark
      </span>
      {PROGRAMME.map((s, i) => (
        <div key={s.label} className="p-step">
          <div className="p-step-track">
            <div className={`p-step-bar ${i === 0 ? 'is-today' : ''}`} style={{ '--h': `${h(s.onTime)}%`, ...d(3 + i) } as CSSProperties}>
              <b>{s.onTime.toFixed(1)}%</b>
            </div>
          </div>
          <span className="p-step-label">
            {i === 0 ? s.label : `+ ${s.label}`}
            {s.adoption && <em>{s.adoption} adoption</em>}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ───────── comparison: horizontal bars on a 70–100 scale ───────── */
function CompareBars() {
  const lo = 70;
  const x = (v: number) => ((v - lo) / (100 - lo)) * 100;
  return (
    <div className="p-compare in" style={d(2)}>
      {COMPARISON.map((r, i) => (
        <div key={r.label} className={`p-cmp p-cmp-${r.kind}`}>
          <span className="p-cmp-label">{r.label}</span>
          <div className="p-cmp-track">
            <span className="p-cmp-bench" style={{ left: `${x(HEADLINE.benchmark)}%` }}>
              {i === 0 && <span>94% benchmark</span>}
            </span>
            <div className="p-cmp-fill" style={{ ...w(x(r.onTime)), ...d(3 + i) }} />
            <b className="p-cmp-val">{r.onTime.toFixed(1)}%</b>
          </div>
        </div>
      ))}
      <p className="p-axis">Scale starts at 70%</p>
    </div>
  );
}


/* ───────── architecture: as built (docs/ARCHITECTURE.md §1) ───────── */
type Box = { x: number; y: number; w: number; h: number; title: string; sub?: string[]; kind?: 'ai' | 'data' | 'azure' };
const BOXES: Box[] = [
  { x: 20, y: 50, w: 190, h: 86, title: 'Browser', sub: ['Halcyon staff, judges'] },
  { x: 20, y: 298, w: 190, h: 86, title: 'Claude (MCP client)', sub: ['Ask LateLens'] },
  { x: 270, y: 30, w: 250, h: 170, title: 'Next.js web app', sub: ['Landing page + dashboard', 'Sign-in (Entra ID) + page roles', 'Same-origin API proxy', 'App Service'] },
  { x: 20, y: 424, w: 190, h: 70, title: 'Halcyon CSVs', sub: ['+ seeded synthetic data'], kind: 'data' },
  { x: 270, y: 424, w: 250, h: 70, title: 'Python pipeline', sub: ['flags · replay · lane scores'], kind: 'data' },
  { x: 580, y: 424, w: 310, h: 70, title: 'PostgreSQL 16', sub: ['one writer per table'], kind: 'data' },
];
const MODULES = [
  ['intake', 'Gmail poll, extract, decide, reply'],
  ['warehouse', 'promise, stock, penalties'],
  ['carriers', 'lane rules, recommend, journey'],
  ['assistant', 'Ask LateLens in the dashboard'],
  ['mcp', '6 read-only tools, own token'],
];
const AZURE: [string, string, boolean][] = [
  ['Azure OpenAI', 'reads emails, drafts, words answers', true],
  ['Azure AI Language', 'removes PII before the model', false],
  ['Azure Maps', 'checks the address', false],
  ['Gmail REST API', 'order inbox, replies in thread', false],
  ['Entra ID', 'staff sign-in', false],
  ['Key Vault · App Insights', 'secrets · logs', false],
];

function ArchDiagram() {
  const ax = 950;
  return (
    <svg className="p-arch in" style={d(2)} viewBox="0 0 1200 500" role="img" aria-label="Root Route architecture: browser and Claude call a Next.js web app and a Fastify API on Azure App Service; the API uses Azure OpenAI, AI Language, Maps and Gmail; a Python pipeline writes result tables to PostgreSQL, which the API reads.">
      <defs>
        <marker id="pa-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" className="pa-head" />
        </marker>
      </defs>

      {/* connectors */}
      <g className="pa-line" markerEnd="url(#pa-arrow)">
        <line x1="210" y1="93" x2="268" y2="93" />
        <line x1="520" y1="115" x2="578" y2="115" />
        <line x1="210" y1="341" x2="578" y2="341" />
        <line x1="210" y1="459" x2="268" y2="459" />
        <line x1="520" y1="459" x2="578" y2="459" />
        <line x1="735" y1="384" x2="735" y2="422" />
        {AZURE.slice(0, 4).map((_, k) => (
          <line key={k} x1="890" y1={58 + k * 56} x2={ax - 2} y2={58 + k * 56} />
        ))}
      </g>
      <text className="pa-edge" x="225" y="330">MCP over HTTPS</text>
      <text className="pa-edge" x="527" y="104">signed JWT</text>
      <text className="pa-edge" x="525" y="448">writes</text>
      <text className="pa-edge" x="745" y="408">reads · writes live tables</text>

      {BOXES.map((b) => (
        <g key={b.title}>
          <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="12" className={`pa-box ${b.kind ? `is-${b.kind}` : ''}`} />
          <text className="pa-title" x={b.x + 16} y={b.y + 28}>{b.title}</text>
          {b.sub?.map((t, k) => (
            <text key={t} className="pa-sub" x={b.x + 16} y={b.y + 50 + k * 22}>{t}</text>
          ))}
        </g>
      ))}

      {/* API with its modules */}
      <rect x="580" y="30" width="310" height="354" rx="12" className="pa-box is-api" />
      <text className="pa-title" x="596" y="58">Fastify API</text>
      <text className="pa-sub" x="596" y="80">App Service · default-deny permissions</text>
      {MODULES.map(([m, t], k) => (
        <g key={m}>
          <rect x="596" y={96 + k * 54} width="278" height="44" rx="8" className="pa-mod" />
          <text className="pa-mod-name" x="610" y={123 + k * 54}>{m}</text>
          <text className="pa-mod-sub" x="700" y={123 + k * 54}>{t}</text>
        </g>
      ))}

      {AZURE.map(([t, s, ai], k) => (
        <g key={t}>
          <rect x={ax} y={30 + k * 56} width="230" height="46" rx="8" className={`pa-box ${ai ? 'is-ai' : 'is-azure'}`} />
          <text className="pa-mod-name" x={ax + 14} y={50 + k * 56}>{t}</text>
          <text className="pa-mod-sub" x={ax + 14} y={68 + k * 56}>{s}</text>
        </g>
      ))}
      <text className="pa-edge" x={ax} y="378">Azure services</text>
    </svg>
  );
}

/* ───────── workflow: one email order (SPEC §5.3) ───────── */
type Kind = 'code' | 'ai' | 'person' | 'out';
const TAG: Record<Kind, string> = { code: 'Code', ai: 'AI', person: 'Person', out: 'Result' };
type Step = { t: string; s: string; k: Kind };
const INTAKE: Step[] = [
  { t: 'Gmail poll', s: 'every 10 min, deduped', k: 'code' },
  { t: 'Identify client', s: 'by sender domain', k: 'code' },
  { t: 'Remove PII', s: 'names, phones, emails', k: 'code' },
  { t: 'Extract order', s: 'email → JSON, schema-checked', k: 'ai' },
  { t: 'Check', s: 'SKUs, address, map', k: 'code' },
  { t: 'Decide', s: 'one of three states', k: 'code' },
];
const BRANCHES: { state: string; steps: Step[] }[] = [
  {
    state: 'ALL_CLEAR',
    steps: [
      { t: 'Promise · warehouse · carrier', s: 'cut-off, nearest stock, lane rules', k: 'code' },
      { t: 'Draft confirmation', s: 'facts copied verbatim', k: 'ai' },
      { t: 'Supervisor approves', s: 'may change carrier, with a reason', k: 'person' },
      { t: 'Warehouse system', s: 'only after approval', k: 'out' },
    ],
  },
  {
    state: 'CONFIRM_ADDRESS',
    steps: [
      { t: 'Draft address request', s: 'what is missing, in plain words', k: 'ai' },
      { t: 'Send in the client’s thread', s: 'automatic only if every safety check passes', k: 'person' },
      { t: 'Client answers', s: 'the reply re-enters at Extract', k: 'out' },
    ],
  },
  {
    state: 'MISSING_INFO',
    steps: [
      { t: 'Draft reply', s: 'unknown SKUs get suggestions', k: 'ai' },
      { t: 'Operator approves and sends', s: 'or leaves it', k: 'person' },
    ],
  },
];

function StepChip({ s, i }: { s: Step; i: number }) {
  return (
    <li className={`wf-step is-${s.k} in`} style={d(i)}>
      <span className="wf-tag">{TAG[s.k]}</span>
      <b>{s.t}</b>
      <span className="wf-sub">{s.s}</span>
    </li>
  );
}

function Workflow() {
  return (
    <div className="wf">
      <ol className="wf-row">
        {INTAKE.map((s, k) => (
          <StepChip key={s.t} s={s} i={2 + k} />
        ))}
      </ol>
      <div className="wf-branches">
        {BRANCHES.map((b, bi) => (
          <div key={b.state} className="wf-branch in" style={d(8 + bi)}>
            <span className="wf-state">{b.state}</span>
            <ol className="wf-row wf-row-sub">
              {b.steps.map((s, k) => (
                <StepChip key={s.t} s={s} i={9 + bi + k} />
              ))}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}

const BASE: Slide[] = [
  {
    id: 'title',
    title: 'Root Route',
    speaker: 'Carriers',
    notes: ['Introduce the team: one speaker per problem area (email orders, warehouse and promise, carriers).'],
    body: (
      <div className="p-title">
        <BrandMark className="p-title-mark in" />
        <h1 className="p-h1 in" style={d(1)}>
          Root Route
        </h1>
        <p className="p-lede in" style={d(2)}>
          What Halcyon’s own data says makes a delivery late, and what fixes it.
        </p>
        <p className="p-meta in" style={d(3)}>
          LateLens delivery diagnostics · FDE AI Hackathon 5.0, Problem 2 · {fmt(DATASET.deliveries)} deliveries,{' '}
          {DATASET.period}
        </p>
      </div>
    ),
  },
  {
    id: 'belief',
    title: 'The belief',
    speaker: 'Carriers',
    notes: [
      'Halcyon is 71% on time against a 94% benchmark.',
      'Leadership believes carrier routing is the cause and is two weeks from a $680K routing-engine contract.',
      'We asked a simpler question first: what does their own data say makes a delivery late?',
    ],
    body: (
      <>
        <Kick>The starting point</Kick>
        <h2 className="p-h2 in" style={d(1)}>
          Halcyon delivers on time <span className="p-hl">{pts(HEADLINE.onTime)}%</span> of the time. The benchmark is{' '}
          {HEADLINE.benchmark}%.
        </h2>
        <div className="p-grid3">
          <div className="p-stat in" style={d(2)}>
            <b>{fmt(HEADLINE.late)}</b>
            <span>late deliveries in six months</span>
          </div>
          <div className="p-stat in" style={d(3)}>
            <b>{HEADLINE.routingContract}</b>
            <span>routing-engine contract, two weeks from signature</span>
          </div>
          <div className="p-stat in" style={d(4)}>
            <b>{DATASET.clients} · {DATASET.warehouses} · {DATASET.carriers}</b>
            <span>clients · warehouses · carriers</span>
          </div>
        </div>
        <p className="p-q in" style={d(5)}>
          The belief: carrier routing is the cause. The question: what does the data say?
        </p>
      </>
    ),
  },
  {
    id: 'cost',
    title: 'What lateness costs',
    speaker: 'Carriers',
    notes: [
      'Lateness costs $1.35M in six months: penalties plus handling.',
      'That is 1.8 times the whole freight bill.',
      'Nine at-risk accounts, $14.2M a year, sit on the same 71%.',
    ],
    body: (
      <>
        <Kick>The cost</Kick>
        <h2 className="p-h2 in" style={d(1)}>
          Late deliveries cost <span className="p-hl">{usd(HEADLINE.failureCostUsd)}</span> in six months:{' '}
          {HEADLINE.freightMultiple}× the freight bill.
        </h2>
        <div className="p-grid3">
          <div className="p-stat in" style={d(2)}>
            <b>{usd(HEADLINE.penaltiesUsd)}</b>
            <span>SLA penalties paid (4,847 × $180)</span>
          </div>
          <div className="p-stat in" style={d(3)}>
            <b>{usd(HEADLINE.handlingUsd)}</b>
            <span>late-delivery handling ({fmt(HEADLINE.late)} × $34)</span>
          </div>
          <div className="p-stat in" style={d(4)}>
            <b>{HEADLINE.atRiskAccounts} accounts</b>
            <span>at risk, {HEADLINE.atRiskRevenue} of revenue a year</span>
          </div>
        </div>
        <p className="p-foot in" style={d(5)}>
          Carrier freight over the same period: ≈ $738K.
        </p>
      </>
    ),
  },
  {
    id: 'causes',
    title: 'Five causes',
    speaker: 'Carriers',
    notes: [
      'Five causes explain every late delivery. A delivery with none of them was never late.',
      'Of the 29 points between 71% and 100%, carrier lanes cost 7.6. Address 7.0, wrong warehouse 5.6, cut-off 5.6, route detours 3.2.',
      'Deliveries with two causes are shared between them (Shapley), so the points add up to exactly 29.0.',
    ],
    body: (
      <>
        <Kick>What the data shows</Kick>
        <h2 className="p-h2 in" style={d(1)}>
          Five causes explain <span className="p-hl">every</span> late delivery.
        </h2>
        <CauseBar />
        <ul className="p-causes">
          {CAUSES.map((c, i) => (
            <li key={c.key} className={`in ${c.beforePickup ? 'is-pre' : 'is-post'}`} style={d(4 + i)}>
              <b>{pts(c.points)} pts</b>
              <span className="p-cause-label">{c.label}</span>
              <span className="p-cause-meta">
                {c.stage} · {fmt(c.deliveries)} deliveries, {c.lateRatePct}% late
              </span>
            </li>
          ))}
        </ul>
        <p className="p-foot in" style={d(10)}>
          <span className="p-key is-pre" /> before pickup <span className="p-key is-post" /> carrier or road ·{' '}
          {fmt(NO_CAUSE.deliveries)} deliveries had none of the five: {NO_CAUSE.lateRatePct}% late.
        </p>
      </>
    ),
  },
  {
    id: 'pre-pickup',
    title: 'Before pickup',
    speaker: 'Carriers',
    notes: [
      '67% of late deliveries already had a cause before a truck was booked.',
      '28 of the 34 complaints are about one of those deliveries.',
      'That is why carrier scorecards make carriers look worse than they are.',
    ],
    body: (
      <div className="p-big">
        <Kick>Where lateness starts</Kick>
        <p className="p-mega in" style={d(1)}>
          {HEADLINE.prePickupSharePct}%
        </p>
        <h2 className="p-h2 in" style={d(2)}>
          of late deliveries have a cause <span className="p-hl">before pickup</span>.
        </h2>
        <p className="p-lede in" style={d(3)}>
          Incomplete address · order after the 8am cut-off · shipped from a warehouse that isn’t the nearest.
        </p>
        <p className="p-foot in" style={d(4)}>
          {HEADLINE.complaintsPrePickup} of {HEADLINE.complaints} complaints are about one of these deliveries.
        </p>
      </div>
    ),
  },
  {
    id: 'carriers',
    title: 'Carriers, judged fairly',
    speaker: 'Carriers',
    notes: [
      'Scorecards today blame carriers for orders that were late before pickup, so every carrier looks about 75%.',
      'We score on fair data only: no address, stock or cut-off cause. Good lanes are 95%.',
      'Five lanes stand out. D is fine elsewhere except Fridays: that is capacity, so a Friday cap, not dropping D.',
      'Lane rules trained on April–July reach 78.2% on held-out August–September.',
    ],
    body: (
      <>
        <Kick>Carriers, on fair data</Kick>
        <h2 className="p-h2 in" style={d(1)}>
          Carrier problems are real, and <span className="p-hl">lane-specific</span>.
        </h2>
        <div className="p-split">
          <div className="p-panel in" style={d(2)}>
            <h3>Carriers A, B and C</h3>
            <div className="p-vs">
              <div>
                <b className="p-dim">{CARRIERS.abcRaw}%</b>
                <span>raw on-time, what a scorecard shows</span>
              </div>
              <span className="p-arrow" aria-hidden="true">→</span>
              <div>
                <b>{CARRIERS.abcFair}%</b>
                <span>on fair data: no address, stock or cut-off cause</span>
              </div>
            </div>
          </div>
          <div className="p-panel in" style={d(3)}>
            <h3>Five lanes over the {CARRIERS.laneLimitPct}% late limit</h3>
            <ul className="p-lanes">
              {BAD_LANES.map((l, i) => (
                <li key={l.carrier + l.region} className="in" style={d(4 + i)}>
                  <span className="p-lane">
                    {l.carrier} → {l.region}
                  </span>
                  <span className="p-lane-track">
                    <span className="p-lane-fill" style={w(l.latePct * 2)} />
                  </span>
                  <b>{l.latePct}% late</b>
                </li>
              ))}
            </ul>
            <p className="p-note">Carrier D on Fridays: capacity, so a Friday cap rather than a block.</p>
          </div>
        </div>
        <p className="p-foot in" style={d(9)}>
          Five lane rules and a Friday cap, trained on Apr–Jul: {CARRIERS.holdoutOnTime}% on time on held-out Aug–Sep.
        </p>
      </>
    ),
  },
  {
    id: 'email',
    title: 'Email orders',
    speaker: 'Email',
    notes: [
      '28% of email orders arrive with an incomplete address; today nobody finds out until the delivery fails.',
      'Live demo: the C190 email (synthetic, labelled). The model turns it into JSON; code checks the address and decides; the agent drafts the reply.',
      'Nothing goes to the WMS until an operator approves. 48 of 50 test emails get the right decision.',
      'Fallback if the live model fails: LLM_PROVIDER=recorded, and say so.',
    ],
    body: (
      <>
        <Kick>Email orders</Kick>
        <h2 className="p-h2 in" style={d(1)}>
          <span className="p-hl">{EMAIL.incompleteAddressPct}%</span> of email orders arrive with an incomplete address.
        </h2>
        <ol className="p-flow">
          <li className="in" style={d(2)}>
            <b>AI reads</b>
            <span>The model turns a messy email into structured JSON. That is its only job.</span>
          </li>
          <li className="in" style={d(3)}>
            <b>Code decides</b>
            <span>Rules check the address and promise; an incomplete address gets a drafted reply to the client.</span>
          </li>
          <li className="in" style={d(4)}>
            <b>A person approves</b>
            <span>Nothing reaches the warehouse system until an operator approves the order.</span>
          </li>
        </ol>
        <div className="p-grid3">
          <div className="p-stat in" style={d(5)}>
            <b>≥ {EMAIL.fixturesCorrectMin} of {EMAIL.fixtures}</b>
            <span>test emails get the right decision</span>
          </div>
          <div className="p-stat in" style={d(6)}>
            <b>≥ {EMAIL.recallMinPct}%</b>
            <span>of incomplete addresses caught</span>
          </div>
          <div className="p-stat in" style={d(7)}>
            <b>
              {EMAIL.onTimeToday}% → {EMAIL.onTimeAsBuilt}%
            </b>
            <span>email orders on time, replayed</span>
          </div>
        </div>
        <p className="p-foot in" style={d(8)}>
          Demo emails are synthetic, generated from the supplied ids and dates, and badged “Synthetic data”.
        </p>
      </>
    ),
  },
  {
    id: 'warehouse',
    title: 'Warehouse and promise',
    speaker: 'Warehouse',
    notes: [
      'Two rules at order time. First, the promise respects the 8am pick list: 4,826 same-day orders came after 8am, 61% late.',
      'Second, the nearest warehouse: 691 orders skipped a nearest warehouse that had stock.',
      'Stock-outs at the nearest warehouse are the bigger group; Root Route flags them and suggests weekly stock placement.',
    ],
    body: (
      <>
        <Kick>Warehouse and promise</Kick>
        <h2 className="p-h2 in" style={d(1)}>
          Two rules at order time keep the promise <span className="p-hl">honest</span>.
        </h2>
        <div className="p-split">
          <div className="p-panel in" style={d(2)}>
            <h3>Cut-off-aware promise</h3>
            <p className="p-panel-big">{fmt(WAREHOUSE.afterCutoff)}</p>
            <p>
              same-day orders came in after the 8am pick list; <b>{WAREHOUSE.afterCutoffLatePct}%</b> were late. After
              cut-off, Root Route promises next day.
            </p>
          </div>
          <div className="p-panel in" style={d(3)}>
            <h3>Nearest warehouse first</h3>
            <p className="p-panel-big">{fmt(WAREHOUSE.skippedNearest)}</p>
            <p>
              orders skipped a nearest warehouse that had stock. Another {fmt(WAREHOUSE.nearestOutOfStock)} found it out
              of stock ({WAREHOUSE.outOfStockLatePct}% late): flagged, with a weekly stock-placement suggestion.
            </p>
          </div>
        </div>
      </>
    ),
  },
  {
    id: 'replay',
    title: 'Replay',
    speaker: 'Warehouse',
    notes: [
      'The replay switches each fix on, one at a time, over the same 48,340 deliveries, at a realistic adoption rate.',
      'Step through: 76.2, 82.5, 87.3, 91.0, 92.0. 10,150 fewer late deliveries, about $981K avoided in six months.',
      'What we built this week reaches 85.9% on its own.',
    ],
    body: (
      <>
        <Kick>Replay on Halcyon’s own deliveries</Kick>
        <h2 className="p-h2 in" style={d(1)}>
          Fix by fix, from <span className="p-dim">71.0%</span> to <span className="p-hl">92.0%</span>.
        </h2>
        <StepChart />
        <p className="p-foot in" style={d(10)}>
          Full programme: {fmt(PROGRAMME_RESULT.lateAvoided)} fewer late deliveries, {usd(PROGRAMME_RESULT.costAvoidedUsd)}{' '}
          avoided in six months. Built this week: <b>{AS_BUILT.onTime}%</b>, {fmt(AS_BUILT.lateAvoided)} fewer late,{' '}
          {usd(AS_BUILT.costAvoidedUsd)} avoided.
        </p>
      </>
    ),
  },
  {
    id: 'compare',
    title: 'Same data, different fixes',
    speaker: 'Warehouse',
    notes: [
      'Same data, same method. Fixing every carrier lane and every route overrun, perfectly, reaches 80.4%.',
      'Route detours alone are worth 3.2 points.',
      'Do not say what Halcyon should do about the contract: this is what the data shows.',
    ],
    body: (
      <>
        <Kick>Same data, same method</Kick>
        <h2 className="p-h2 in" style={d(1)}>
          Every lane and route overrun fixed, perfectly, reaches <span className="p-hl">80.4%</span>.
        </h2>
        <CompareBars />
      </>
    ),
  },
  {
    id: 'kpis',
    title: 'Before and after',
    speaker: 'Warehouse',
    notes: ['Halcyon’s own KPIs, six months, replayed. These are estimates on past deliveries; a pilot measures them for real.'],
    body: (
      <>
        <Kick>Halcyon’s KPIs, six months, replayed</Kick>
        <h2 className="p-h2 in" style={d(1)}>
          Today vs with Root Route.
        </h2>
        <table className="p-table in" style={d(2)}>
          <thead>
            <tr>
              <th scope="col">KPI</th>
              <th scope="col">Today</th>
              <th scope="col">As built</th>
              <th scope="col">Full programme</th>
            </tr>
          </thead>
          <tbody>
            {KPIS.map((k) => (
              <tr key={k.kpi}>
                <th scope="row">{k.kpi}</th>
                <td className="p-dim">{k.today}</td>
                <td>{k.built}</td>
                <td className="p-hl">{k.full}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="p-foot in" style={d(3)}>
          Replayed estimates on past deliveries, not observed results. The pilot measure: ≥ 85% on time at pilot sites
          within 8 weeks.
        </p>
      </>
    ),
  },
  {
    id: 'workflow',
    title: 'Workflow',
    speaker: 'Email',
    notes: [
      'One email order, end to end. Code runs every step; the AI is used at two: reading the email and drafting the reply.',
      'PII is removed before the model sees the text. The model output must pass a schema check, else MISSING_INFO.',
      'Code decides one of three states. Only ALL_CLEAR orders get a promise, warehouse and carrier, and a supervisor approves before the warehouse system.',
      'Address requests go out in the client’s own thread; the answer comes back into the same pipeline.',
    ],
    body: (
      <>
        <Kick>Workflow: one email order</Kick>
        <h2 className="p-h2 p-h2-wide in" style={d(1)}>
          Code runs every step. AI reads and drafts. A <span className="p-hl">person approves</span>.
        </h2>
        <Workflow />
      </>
    ),
  },
  {
    id: 'architecture',
    title: 'Architecture',
    speaker: 'Carriers',
    notes: [
      'Two apps on Azure App Service: the Next.js web app and the Fastify API. The browser only talks to the web app; its proxy signs a 60-second token for the API.',
      'Python computes, Node looks up: the pipeline writes every analysis table, the API reads them and writes only live work. One writer per table, so the replay and the live app cannot disagree.',
      'The AI model is called from two places only: intake and the assistant. Claude reaches the same six read-only tools over MCP.',
    ],
    body: (
      <>
        <Kick>Architecture, as built</Kick>
        <h2 className="p-h2 p-h2-wide in" style={d(1)}>
          Python computes, Node looks up. <span className="p-hl">One writer per table.</span>
        </h2>
        <ArchDiagram />
      </>
    ),
  },
  {
    id: 'built',
    title: 'Design rules',
    speaker: 'Carriers',
    notes: [
      'Python computes, Node looks up: every figure on screen comes from a table the pipeline writes.',
      'Ask LateLens: questions answered from read-only tools over the same tables, so it quotes the same numbers.',
      'Demo: ask "Which carrier lanes should we stop using, and why?"',
    ],
    body: (
      <>
        <Kick>Design rules</Kick>
        <h2 className="p-h2 in" style={d(1)}>
          Rules where rules are enough. AI only where it reads or writes language.
        </h2>
        <div className="p-grid3">
          <div className="p-panel in" style={d(2)}>
            <h3>Numbers from data</h3>
            <p>
              A Python pipeline flags the five causes and runs the replay. The API and dashboard only look figures up, and
              tests assert every headline number.
            </p>
          </div>
          <div className="p-panel in" style={d(3)}>
            <h3>AI with guardrails</h3>
            <p>
              The model reads emails, drafts replies and answers questions from read-only tools. Email is untrusted input;
              outbound mail goes to an allow-list only.
            </p>
          </div>
          <div className="p-panel in" style={d(4)}>
            <h3>Ask LateLens</h3>
            <p>
              A connector lets Claude answer data questions from the same tables, quoting the same numbers as the
              dashboard.
            </p>
          </div>
        </div>
        <p className="p-foot in" style={d(5)}>
          Next.js · Node + Fastify · PostgreSQL · Python · Azure
        </p>
      </>
    ),
  },
  {
    id: 'close',
    title: 'Close',
    speaker: 'Email',
    notes: [
      'Three quarters of the lateness starts before pickup. Carrier lanes are real, and five rules reach them.',
      'Root Route shows where each point goes, what fixes it and what the replay says it is worth. What they do with that is their call.',
    ],
    body: (
      <div className="p-big">
        <Kick>In short</Kick>
        <h2 className="p-h2 p-h2-lg in" style={d(1)}>
          Root Route shows Halcyon where each point of on-time goes, what fixes it, and what the replay says it’s worth.
        </h2>
        <p className="p-lede in" style={d(2)}>
          The decisions stay with Halcyon.
        </p>
        <p className="p-links in" style={d(3)}>
          <a href={LINKS.app}>rootroute.in</a>
          <a href={LINKS.dashboard}>rootroute.in/dashboard</a>
        </p>
        <p className="p-meta in" style={d(4)}>
          Thank you.
        </p>
      </div>
    ),
  },
];

/* ───────────────────────── slides added for the organisers' seven sections ───────────────────────── */

const DISCOVERY_ROWS: { q: string; who: string; a: string; change: string }[] = [
  {
    q: 'Is carrier routing really the cause of 71%?',
    who: 'The data, 48,340 deliveries',
    a: '67% of late deliveries have a cause before pickup; carriers cost 7.6 of 29 points',
    change: 'The five-cause model and the replay',
  },
  {
    q: 'Is carrier D bad everywhere?',
    who: 'The data, fair deliveries by weekday',
    a: 'No: reliable except Fridays, when D carries 39% of volume',
    change: 'A Friday capacity cap, not a block',
  },
  {
    q: 'Is an email order’s timestamp its arrival or its keying?',
    who: 'Halcyon, question log Q-005',
    a: 'Keying time into the WMS; arrival is not recorded',
    change: 'Read the inbox every 10 minutes, before the 8am pick list',
  },
  {
    q: 'How do clients hear about delays today?',
    who: 'Halcyon, question log Q-004',
    a: 'They don’t: no proactive updates; clients chase, usually next day',
    change: 'Delay notices to the client, and a person sends them',
  },
  {
    q: 'Should the intake read Gmail through an MCP server?',
    who: 'Email owner, Gmail MCP servers',
    a: 'No: a mailbox tool in the model’s hands lets an email trigger actions',
    change: 'Gmail REST API from code; no tools for the intake model',
  },
];

const PRODUCT_AGENTS: { name: string; role: string; ai: string; gate: string; status: string }[] = [
  { name: 'Intake agent', role: 'Order desk, warehouse supervisor', ai: 'Email → order JSON; drafts the reply', gate: 'Supervisor approves before the WMS', status: 'Core' },
  { name: 'Complaint triage', role: 'Customer success', ai: 'Drafts a response with the cause found', gate: 'Agent drafts, a person sends', status: 'Core' },
  { name: 'Ask LateLens (MCP)', role: 'Leadership, COO', ai: 'Chooses read-only tools, answers from them', gate: 'Read-only: no action possible', status: 'Core' },
  { name: 'In-app assistant', role: 'Every dashboard role', ai: 'Same six tools; code checks every figure', gate: 'Read-only; answers only', status: 'After submission, behind a flag' },
];
const BUILD_AGENTS = ['spec-writer', 'planner', 'implementer', 'reviewer', 'numbers-auditor', 'qa-evidence', 'discovery-recorder', 'network-security-auditor', 'privacy-compliance-auditor', 'devops', 'jury'];

const FUTURE: { when: string; items: string[] }[] = [
  {
    when: 'Now · 2–3 weeks',
    items: ['Run on Halcyon’s own data: upload, validator, readable errors', 'Time-zone-aware cut-off', 'Alert on “late, cause unknown”', 'Start an analysis from the UI'],
  },
  {
    when: 'Next · 1–2 months',
    items: ['8-week pilot: treatment and control warehouses, stop rule at week 4', 'Incremental runs and a daily sync from Halcyon’s database', 'Scheduled model retraining with a holdout gate', 'Production hosting, backups, load test'],
  },
  {
    when: 'Later · a quarter',
    items: ['Multi-tenant: a second client on the same platform', 'Columnar storage for billions of rows', 'Turn on the in-app assistant and the address-confirm link'],
  },
];
const PHASE2 = [
  { label: 'As built', onTime: 88.5 },
  { label: '+ address checks on API / EDI orders', onTime: 90.6 },
  { label: '+ nearest-warehouse stock-outs fixed', onTime: 94.0 },
  { label: '+ both', onTime: 96.3 },
];

const DEMO_STEPS: { screen: string; what: string; who: Speaker; ai?: boolean }[] = [
  { screen: 'Overview', what: 'Five causes, 67% before pickup, 28 of 34 complaints', who: 'Carriers' },
  { screen: 'Carriers', what: 'Five bad lanes on fair data; D fails only on Fridays', who: 'Carriers' },
  { screen: 'Order emails', what: 'C190’s messy email: the model’s JSON next to the code’s address check', who: 'Email', ai: true },
  { screen: 'Order emails', what: 'Agent drafts the address request → client replies → ALL_CLEAR', who: 'Email', ai: true },
  { screen: 'Order emails', what: 'Your email: a judge writes an order, processed live', who: 'Email', ai: true },
  { screen: 'Order emails', what: 'A bad input: refused with one readable sentence, nothing stored', who: 'Email' },
  { screen: 'Order review', what: 'Supervisor approves; the order goes to the WMS', who: 'Email' },
  { screen: 'Complaints', what: 'One complaint triaged: cause found, response drafted', who: 'Email', ai: true },
  { screen: 'Warehouses', what: 'Cut-off promise and nearest-warehouse stock', who: 'Warehouse' },
  { screen: 'Replay', what: 'The programme, step by step: 71.0% → 92.0%', who: 'Warehouse' },
  { screen: 'Claude + LateLens', what: '“Which carrier lanes should we stop using, and why?”', who: 'Carriers', ai: true },
];

const EXTRA: Slide[] = [
  {
    id: 'agenda',
    title: 'Agenda',
    speaker: 'Carriers',
    notes: ['Seven parts, in the order the organisers asked for. The live demo closes it, running on the deployed app with the real AI model.'],
    body: (
      <>
        <Kick>Agenda</Kick>
        <ol className="p-agenda">
          {SECTIONS.map((t, k) => (
            <li key={t} className="in" style={d(1 + k)}>
              <span className="p-agenda-n">{k + 1}</span>
              {t}
            </li>
          ))}
        </ol>
      </>
    ),
  },
  {
    id: 'discovery',
    title: 'Discovery',
    speaker: 'Carriers',
    notes: [
      'We logged 38 discovery questions, to the data, Halcyon (through the organisers’ question log), the organisers and the team, each with what it changed (SPEC §14.1).',
      'Pick two rows to say out loud: routing is not the main cause, and D is a Friday capacity problem.',
    ],
    body: (
      <>
        <Kick>Discovery insights</Kick>
        <h2 className="p-h2 p-h2-wide in" style={d(1)}>
          38 questions asked, each with an answer and <span className="p-hl">what it changed</span>.
        </h2>
        <table className="p-table p-table-text in" style={d(2)}>
          <thead>
            <tr>
              <th scope="col">Question</th>
              <th scope="col">Asked</th>
              <th scope="col">Answer</th>
              <th scope="col">What we changed</th>
            </tr>
          </thead>
          <tbody>
            {DISCOVERY_ROWS.map((r) => (
              <tr key={r.q}>
                <th scope="row">{r.q}</th>
                <td className="p-dim">{r.who}</td>
                <td>{r.a}</td>
                <td className="p-hl">{r.change}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="p-foot in" style={d(3)}>
          Full log: 38 questions to the data, Halcyon (5 via the organisers’ question log), the organisers and the team.
        </p>
      </>
    ),
  },
  {
    id: 'approach',
    title: 'Solution approach',
    speaker: 'Carriers',
    notes: [
      'Fix each cause where it starts. One problem area per teammate, each owning its folder in every layer.',
      'Rules where rules are enough; AI only to read emails, draft replies and answer data questions.',
      'The replay measures every fix on the same deliveries, so nothing is claimed that the data does not show.',
    ],
    body: (
      <>
        <Kick>Solution approach</Kick>
        <h2 className="p-h2 p-h2-wide in" style={d(1)}>
          Fix each cause <span className="p-hl">where it starts</span>, then replay it on the same deliveries.
        </h2>
        <div className="p-grid3">
          <div className="p-panel p-area in" style={d(2)}>
            <span className="p-area-tag">Email orders · 7.0 pts</span>
            <h3>Catch the address at intake</h3>
            <p>The AI reads the email; code checks the address against the map; the client is asked before the pick list.</p>
          </div>
          <div className="p-panel p-area in" style={d(3)}>
            <span className="p-area-tag">Warehouse &amp; promise · 11.2 pts</span>
            <h3>Honest promise, nearest stock</h3>
            <p>After the 8am cut-off, promise next day. Ship from the nearest warehouse that has stock.</p>
          </div>
          <div className="p-panel p-area in" style={d(4)}>
            <span className="p-area-tag is-post">Carriers · 7.6 pts</span>
            <h3>Five lane rules, a Friday cap</h3>
            <p>Score carriers on fair data only, block the five bad lanes, cap carrier D on Fridays.</p>
          </div>
        </div>
        <p className="p-foot in" style={d(5)}>
          Points are on-time points lost to each cause today. Route detours (3.2 pts) are watched, not routed around.
        </p>
      </>
    ),
  },
  {
    id: 'agents',
    title: 'AI agents',
    speaker: 'Email',
    notes: [
      'Each agent serves a different Halcyon role and keeps the same rule: the model proposes, code checks, a person decides.',
      'Agents also built the product: spec, plan, build test-first, review, audit numbers, record evidence. 39 run records in docs/agent-runs.',
    ],
    body: (
      <>
        <Kick>AI agents used</Kick>
        <h2 className="p-h2 p-h2-wide in" style={d(1)}>
          The model proposes, code checks, <span className="p-hl">a person decides</span>.
        </h2>
        <table className="p-table p-table-text in" style={d(2)}>
          <thead>
            <tr>
              <th scope="col">Agent in the product</th>
              <th scope="col">Serves</th>
              <th scope="col">AI step</th>
              <th scope="col">Human gate</th>
            </tr>
          </thead>
          <tbody>
            {PRODUCT_AGENTS.map((a) => (
              <tr key={a.name}>
                <th scope="row">
                  {a.name}
                  {a.status !== 'Core' && <em className="p-tag-soft">{a.status}</em>}
                </th>
                <td className="p-dim">{a.role}</td>
                <td>{a.ai}</td>
                <td>{a.gate}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="p-build in" style={d(3)}>
          <span className="p-build-label">Agents that built it · spec → plan → build → review</span>
          <ul>
            {BUILD_AGENTS.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      </>
    ),
  },
  {
    id: 'quality',
    title: 'Quality and security',
    speaker: 'Email',
    notes: [
      'A fresh clone following the README passed 740 of 740 tests (API, dashboard, Python, WMS simulator) plus typecheck.',
      'AI is graded by code, not by another model. Intake eval on the 50 synthetic emails: 49/50 decisions, every field, every incomplete address. The injection email never becomes ALL_CLEAR.',
      'Security: no secrets in git history, Key Vault and GitHub OIDC, Entra sign-in with six roles and default deny, outbound mail to an allow-list only.',
    ],
    body: (
      <>
        <Kick>Quality, validation &amp; security</Kick>
        <h2 className="p-h2 p-h2-wide in" style={d(1)}>
          Every headline number is <span className="p-hl">asserted by a test</span>.
        </h2>
        <div className="p-grid3 p-grid3-tight">
          <div className="p-stat in" style={d(2)}>
            <b>740 / 740</b>
            <span>tests pass on a fresh clone: API 502, dashboard 137, Python 96, WMS simulator 5</span>
          </div>
          <div className="p-stat in" style={d(3)}>
            <b>49 / 50</b>
            <span>intake decisions right (gate ≥ 48); 245 / 245 fields; 10 / 10 incomplete addresses caught</span>
          </div>
          <div className="p-stat in" style={d(4)}>
            <b>0 leaks</b>
            <span>gitleaks over all of main’s history; the scan runs in CI and fails the build</span>
          </div>
        </div>
        <div className="p-checks in" style={d(5)}>
          <div>
            <h3>Validation</h3>
            <ul>
              <li>AI graded by code, never by another model; 7 evals with written gates</li>
              <li>“Ignore previous instructions” email never reaches ALL_CLEAR</li>
              <li>Golden tests hold every replay row to 0.1 point</li>
              <li>Playwright end-to-end run after every deploy</li>
            </ul>
          </div>
          <div>
            <h3>Security</h3>
            <ul>
              <li>Entra ID sign-in; six roles, default deny on every API route</li>
              <li>Personal details removed before the model sees an email</li>
              <li>Secrets in Key Vault; CD signs in to Azure with OIDC, no stored password</li>
              <li>Outbound mail only to an allow-list; a person approves every WMS entry</li>
            </ul>
          </div>
        </div>
      </>
    ),
  },
  {
    id: 'future',
    title: 'Future scope',
    speaker: 'Warehouse',
    notes: [
      'From docs/ROADMAP.md: first run on Halcyon’s own data, then prove the fixes with an 8-week pilot, then a second client.',
      'The replay also shows what is left on the table: address checks on API and EDI orders, and nearest-warehouse stock-outs. With both, as built reaches 96.3%.',
    ],
    body: (
      <>
        <Kick>Future scope</Kick>
        <h2 className="p-h2 p-h2-wide in" style={d(1)}>
          From replay to <span className="p-hl">measured</span> results.
        </h2>
        <div className="p-future">
          {FUTURE.map((f, k) => (
            <div key={f.when} className="p-panel in" style={d(2 + k)}>
              <h3>{f.when}</h3>
              <ul>
                {f.items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="p-phase2 in" style={d(5)}>
          <span className="p-build-label">Phase 2 in the replay, every fix applied</span>
          <ol>
            {PHASE2.map((p) => (
              <li key={p.label}>
                <b>{p.onTime.toFixed(1)}%</b>
                <span>{p.label}</span>
              </li>
            ))}
          </ol>
        </div>
      </>
    ),
  },
  {
    id: 'demo',
    title: 'Live demo',
    speaker: 'Email',
    notes: [
      'Switch to the deployed app (rootroute.in/dashboard), signed in with a demo account. Email orders run on the real Azure OpenAI model.',
      'If the live AI call fails: switch to LLM_PROVIDER=recorded and say “these are recorded model responses”.',
      'Before: C190 email reset, Ask LateLens connector signed in, app warm.',
    ],
    body: (
      <>
        <Kick>Live demo</Kick>
        <h2 className="p-h2 p-h2-wide in" style={d(1)}>
          End to end, on the deployed app, with the <span className="p-hl">real AI model</span>.
        </h2>
        <ol className="p-demo">
          {DEMO_STEPS.map((s, k) => (
            <li key={s.screen + k} className={`in ${s.ai ? 'is-ai' : ''}`} style={d(2 + k)}>
              <span className="p-demo-screen">{s.screen}</span>
              <span className="p-demo-what">{s.what}</span>
              <span className="p-demo-who">
                {s.ai && <em>AI</em>}
                {s.who}
              </span>
            </li>
          ))}
        </ol>
        <p className="p-foot in" style={d(12)}>
          <a className="p-inline-link" href={LINKS.dashboard}>rootroute.in/dashboard</a> · Azure OpenAI · demo emails are
          synthetic and badged.
        </p>
      </>
    ),
  },
];

/** Deck order: the organisers' seven sections, framed by the title, agenda and close. */
const ORDER: [string, number | undefined][] = [
  ['title', undefined],
  ['agenda', undefined],
  ['belief', 1],
  ['cost', 1],
  ['discovery', 1],
  ['causes', 1],
  ['pre-pickup', 1],
  ['approach', 2],
  ['email', 2],
  ['warehouse', 2],
  ['carriers', 2],
  ['workflow', 2],
  ['architecture', 2],
  ['agents', 3],
  ['quality', 4],
  ['replay', 5],
  ['compare', 5],
  ['kpis', 5],
  ['future', 6],
  ['demo', 7],
  ['close', undefined],
];

const ALL = [...BASE, ...EXTRA];
export const SLIDES: Slide[] = ORDER.map(([id, section]) => {
  const s = ALL.find((x) => x.id === id);
  if (!s) throw new Error(`present: no slide "${id}"`);
  return { ...s, section };
});
