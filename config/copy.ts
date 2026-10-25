/**
 * All page copy. Figures in [brackets] are placeholders: the page shows them with a dotted
 * underline (see lib/ph.tsx). Replace each with a verified number and drop the brackets.
 * Sections render this text; config/scenes.ts only drives motion, never words.
 */

export const BRAND = 'Root Route';
export const DEMO_HREF = 'mailto:hello@rootroute.example?subject=Root%20Route%20demo';
export const CONTACT_HREF = 'mailto:hello@rootroute.example';
/** the one call to action: header, hero and footer */
const DEMO = { label: 'Book a demo', href: DEMO_HREF };

export const copy = {
  demo: DEMO,

  nav: [
    { label: 'Platform', href: '#detect' },
    { label: 'Network', href: '#network' },
    { label: 'How it works', href: '#optimize' },
    { label: 'Results', href: '#results' },
  ],

  hero: {
    kicker: 'Route optimization for logistics',
    title: 'Every delivery, on the best route.',
    body: 'Root Route picks the carrier, warehouse and route for every order, then re-plans in milliseconds when anything changes.',
    note: 'Parcel, freight and last-mile. Any carrier, any country.',
    primary: DEMO,
    secondary: { label: 'See how it works', href: '#detect' },
    handoff: { step: '02', line: 'Four checks before it leaves the depot' },
    slides: { label: 'Hero videos', item: 'Show video' },
  },

  detect: {
    kicker: 'Platform',
    title: 'Every order checked before the truck moves.',
    cards: [
      {
        t: 'The right carrier for every lane',
        b: 'Scores every carrier on every lane by real on-time performance, cost and capacity, and switches before a lane fails.',
        meter: { id: 'late', label: 'Late risk', start: '34%' },
      },
      {
        t: 'Bad addresses fixed at checkout',
        b: 'Validates and geocodes every address while the customer is still on the page, so a missing unit number never becomes a failed drop.',
        meter: { id: 'addr', label: 'Addresses verified', start: '72%' },
      },
      {
        t: 'Shipped from the closest stock',
        b: 'Picks the nearest warehouse with stock, balances load across sites, and splits or consolidates when that is faster.',
        meter: { id: 'dist', label: 'Distance to customer', start: '1,840 km' },
      },
      {
        t: 'Promises that respect every cutoff',
        b: 'Delivery dates account for carrier cutoffs, holidays and capacity, so the promise at checkout is one you can keep.',
        meter: { id: 'cutoff', label: 'Orders making cutoff', start: '81%' },
      },
    ],
  },

  drive: {
    line: 'Checked, cleared, rolling.',
    lead: { kicker: 'Delivery on the way', line: 'Next stop: your door.' },
  },

  network: {
    kicker: 'Network',
    title: 'One brain for your whole network.',
    meterLabel: 'Orders planned this run',
    body: 'Every order, lane, vehicle and carrier is planned together, not one shipment at a time. Multi-depot, multi-carrier, multi-country, with parcel, LTL, FTL and last-mile in one plan.',
  },

  optimize: {
    kicker: 'How it works',
    title: 'Live in weeks, not quarters.',
    cards: [
      {
        t: 'Connect',
        b: 'Plugs into your order, warehouse and transport systems, carrier APIs and telematics through API, EDI or file drop.',
        meter: { id: 'feeds', label: 'Data feeds live', start: '0%' },
      },
      {
        t: 'Decide',
        b: 'Every order gets a carrier, warehouse and route, each with a plain-language reason, in under [50 ms].',
        meter: { id: 'decision', label: 'Decision time', start: '900 ms' },
      },
      {
        t: 'Learn',
        b: 'Every delivery outcome feeds the next plan, so forecasts sharpen every week.',
        meter: { id: 'forecast', label: 'Forecast accuracy', start: '80%' },
      },
    ],
  },

  deliver: {
    title: 'On time. Every route. Everywhere.',
    meterLabel: 'Delivered on time',
  },

  results: {
    kicker: 'Results',
    title: 'Faster, cheaper, on time, at any scale.',
    stats: [
      { value: 99, suffix: '%', label: 'on-time delivery', ph: true },
      { value: 30, suffix: '%', label: 'fewer late deliveries', ph: true },
      { value: 18, suffix: '%', label: 'lower cost per shipment', ph: true },
      { value: 40, suffix: ' ms', label: 'to re-plan a route', ph: true },
    ],
    security:
      'Encrypted in transit and at rest · SSO and role-based access · An audit trail of every decision · [99.9%] uptime target',
  },

  people: {
    kicker: 'Built for people',
    title: 'Built for people, not just algorithms.',
    items: [
      { t: 'A reason on every route', b: 'Dispatchers see why each carrier, warehouse and route was chosen.' },
      { t: 'Overrides in one click', b: 'Anyone can overrule a pick with a reason, and every override teaches the next plan.' },
      { t: 'Rules you control', b: 'Service levels, capacity limits and preferred carriers apply before anything is ranked.' },
      { t: 'Always a backup plan', b: 'If a feed or carrier goes down, orders fall back to safe routes automatically.' },
    ],
    dashboard: {
      title: 'Order #48213 · Leeds → Bristol',
      rows: [
        { k: 'Carrier', v: 'NorthLine Freight', why: 'Best on-time on this lane, 30 days' },
        { k: 'Warehouse', v: 'Birmingham DC', why: 'Closest site with stock' },
        { k: 'Route', v: 'M1 → M42 → M5', why: 'Avoids A38 closure' },
      ],
      eta: 'Arrives Thu 10:40 · 98% on-time',
    },
  },

  footer: {
    title: 'Every route, on time. Let’s prove it on your orders.',
    body: 'Send us a week of shipments. We’ll show you the routes Root Route would have picked, and what they would have saved.',
    cta: DEMO,
    links: [
      { label: 'Platform', href: '#detect' },
      { label: 'Network', href: '#network' },
      { label: 'How it works', href: '#optimize' },
      { label: 'Contact', href: CONTACT_HREF },
    ],
  },
};
