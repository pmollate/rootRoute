/**
 * All page copy. Figures in [brackets] are placeholders: the page shows them with a dotted
 * underline (see lib/ph.tsx). Replace each with a verified number and drop the brackets.
 * Sections render this text; config/scenes.ts only drives motion, never words.
 *
 * Figures come from the 48,340-delivery reference dataset (5 warehouses, 6 carriers, 280 clients) as the pipeline
 * computes them: docs/SPEC.md §2.1 (headline facts), §2.2 (on-time points per cause) and §5.8 (replay).
 */

import { SCREENS } from './dashboard';

export const BRAND = 'Root Route';
const CONTACT_HREF = 'mailto:hello@rootroute.example';
/** the one call to action: hero and footer. Signed-out visitors land on /login first. */
const OPEN_APP = { label: 'Go to dashboard', href: '/dashboard' };
/** header button; /login sends someone already signed in straight to their first page */
const LOGIN = { label: 'Log in', href: '/login' };

const PLATFORM = { label: 'Platform', href: '#detect' };
const FEATURES = { label: 'Features', href: '#features' };
const HOW = { label: 'How it works', href: '#optimize' };
const RESULTS = { label: 'Results', href: '#results' };

export const copy = {
  nav: [PLATFORM, HOW, RESULTS, FEATURES],
  login: LOGIN,

  /** chapter rail, in story order; ids are the section ids */
  chapters: [
    { id: 'dispatch', name: 'Dispatch' },
    { id: 'detect', name: 'Detect' },
    { id: 'network', name: 'Network' },
    { id: 'optimize', name: 'Optimize' },
    { id: 'deliver', name: 'Deliver' },
  ],

  hero: {
    kicker: 'Delivery diagnostics for logistics teams',
    title: 'Every delivery, on the best route.',
    body: 'Root Route traces every late delivery to its root cause, from a missing address to a lane that fails on Fridays, and hands each fix to the team that owns it.',
    note: 'Order desk, warehouse, carriers and customer support in one workspace.',
    primary: OPEN_APP,
    secondary: { label: 'See how it works', href: PLATFORM.href },
    handoff: { step: '02', line: 'Four checks before it leaves the dock' },
    slides: { label: 'Hero videos', item: 'Show video' },
  },

  /** Each meter counts up the on-time points that cause cost on the reference dataset (SPEC §2.2). */
  detect: {
    kicker: 'Platform',
    title: 'Every order checked before the truck moves.',
    cards: [
      {
        t: 'Addresses complete before they ship',
        b: 'AI reads each emailed order, flags a missing street, suite or ZIP, and drafts the reply asking the client for it. An operator approves before the order reaches the WMS.',
        meter: { id: 'addr', label: 'On-time points at stake', start: '0.0 pts' },
      },
      {
        t: 'Promises that respect the cut-off',
        b: 'Orders that arrive after the dispatch cut-off get a date the warehouse can actually keep, not a same-day promise that is late at checkout.',
        meter: { id: 'cutoff', label: 'On-time points at stake', start: '0.0 pts' },
      },
      {
        t: 'Shipped from the nearest stock',
        b: 'Flags orders sent from a farther warehouse when the nearest one had stock, and suggests weekly stock moves so it does next time.',
        meter: { id: 'wh', label: 'On-time points at stake', start: '0.0 pts' },
      },
      {
        t: 'Carriers judged on fair data',
        b: 'Scores every carrier lane only on deliveries with no upstream cause, so a bad address never counts against a driver. Weak lanes and capacity days stand out.',
        meter: { id: 'lane', label: 'On-time points at stake', start: '0.0 pts' },
      },
    ],
  },

  drive: {
    line: 'Checked, cleared, rolling.',
    lead: { kicker: 'Delivery on the way', line: 'Next stop: your door.' },
  },

  network: {
    kicker: 'Network',
    title: 'One timeline for every delivery.',
    meterLabel: 'Deliveries diagnosed in the reference run',
    body: 'Orders, warehouse picks, carrier scans and complaints are joined into one journey per delivery. Every late one is attributed to the cause that made it late, across every warehouse, carrier and lane.',
  },

  optimize: {
    kicker: 'How it works',
    title: 'From inbox to root cause in three steps.',
    cards: [
      {
        t: 'Connect',
        b: 'Bring orders by email, API or EDI, plus warehouse, carrier, tracking and complaint data. Email is read by AI and always checked by a person.',
        meter: { id: 'feeds', label: 'Data sources joined', start: '0' },
      },
      {
        t: 'Diagnose',
        b: 'Five cause checks run on every delivery: address, cut-off, warehouse, carrier lane and route. Each flag shows the rule and the data behind it.',
        meter: { id: 'explained', label: 'Late deliveries with a cause found', start: '0%' },
      },
      {
        t: 'Replay',
        b: 'Replay past deliveries with each fix switched on to see what it would have changed, before anyone changes a process.',
        meter: { id: 'replay', label: 'On-time, replayed with every fix', start: '71.0%' },
      },
    ],
  },

  deliver: {
    title: 'Fix the cause, not the symptom.',
    meterLabel: 'On-time, replayed with every fix',
  },

  results: {
    kicker: 'Results',
    title: 'What it found in 48,340 deliveries.',
    note: 'Reference run on six months of one network’s data: 5 warehouses, 6 carriers, 280 clients.',
    stats: [
      { value: 67, suffix: '%', label: 'of late deliveries had a cause before pickup' },
      { value: 100, suffix: '%', label: 'of late deliveries traced to one of five causes' },
      { value: 8447, suffix: '', label: 'late deliveries avoided in replay' },
      { value: 17.5, decimals: 1, suffix: ' pts', label: 'on-time gained in replay, 71.0% → 88.5%' },
    ],
    security:
      'Six roles with least-privilege access · Every approval and override recorded · No order reaches the WMS without a person’s approval',
  },

  /** The workspaces in the dashboard, one per team; the order matches the side nav. */
  features: {
    kicker: 'Features',
    title: 'One workspace, a screen for every team.',
    items: [
      { t: 'Overview', b: 'On-time rate, the five causes ranked by points lost, and what each fix is worth.', role: 'Everyone' },
      { t: 'Order emails', b: 'AI-read orders with flagged gaps, drafted client replies and one-click approval to the WMS.', role: 'Order desk' },
      { t: 'Warehouses', b: 'Cut-off misses, orders sent from the wrong site, unpaid penalties and weekly stock moves.', role: 'Warehouse' },
      { t: 'Carriers', b: 'Lane scorecards on fair data, capacity days and a recommended carrier you can override.', role: 'Carriers' },
      { t: 'Complaints', b: 'Every complaint linked to its delivery and triaged by the cause behind it.', role: 'Support' },
      { t: 'Order journey', b: 'One delivery from email to doorstep: each stage, who acted and where it slipped.', role: 'Everyone' },
      { t: 'Replay', b: 'Past deliveries replayed with each fix on, by segment, before you change anything.', role: 'Leadership' },
    ],
  },

  people: {
    kicker: 'Built for people',
    title: 'People decide. Root Route shows why.',
    items: [
      { t: 'A reason on every flag', b: 'Each cause shows the rule and the data that tripped it, in plain language.' },
      { t: 'AI drafts, people approve', b: 'AI reads order emails and drafts replies. Nothing reaches the WMS or a client without a person.' },
      { t: 'Overrides with a reason', b: 'A carrier manager can overrule any recommendation; the reason is kept with the order.' },
      { t: 'A view for each role', b: 'Six roles, from order desk to leadership, each see their own screens and actions.' },
    ],
    dashboard: {
      title: 'Order journey · D000213',
      rows: [
        { k: 'Address', v: 'Complete', why: 'Checked at intake' },
        { k: 'Cut-off', v: 'Missed', why: 'Received after the 8am cut-off' },
        { k: 'Warehouse', v: 'Nearest with stock', why: 'Placement rule passed' },
        { k: 'Carrier lane', v: 'Fair-data score OK', why: 'No lane issue this day', act: 'Override' },
      ],
      eta: 'Root cause: cut-off · fix owned by the order desk',
    },
  },

  /** the closing call to action over the Deliver film's last frame */
  footer: {
    title: 'See why your deliveries run late.',
    body: 'Load your orders, shipments and carrier scans. Root Route shows the cause behind every late delivery and what each fix is worth.',
    cta: OPEN_APP,
  },

  /** the page footer under the film (components/layout/SiteFooter.tsx); workspace links go through sign-in */
  siteFooter: {
    tagline: 'Delivery diagnostics for logistics teams.',
    body: 'Find the cause behind every late delivery, and what each fix is worth, before the next truck leaves the dock.',
    cta: OPEN_APP,
    columns: [
      { title: 'Product', links: [PLATFORM, HOW, RESULTS, FEATURES] },
      { title: 'Workspaces', links: SCREENS.map(({ label, href }) => ({ label, href })) },
      { title: 'Company', links: [{ label: 'Contact', href: CONTACT_HREF }, LOGIN] },
    ],
    trust: ['Role-based access', 'Every approval recorded', 'People approve every order'],
    note: 'Figures on this page come from a 48,340-delivery reference dataset.',
    top: { label: 'Back to top', href: '#dispatch' },
  },

  /** 404: the same shape fits empty lists, unknown tracking IDs, stale tracking, carrier down */
  lost: {
    code: '404',
    accent: 'Wrong turn.',
    title: 'This route doesn’t exist.',
    body: 'The page you were looking for couldn’t be found. It may have moved, or the link was mistyped.',
    home: { label: 'Back to home', href: '/' },
    track: { label: 'Track a shipment', href: '/dashboard' },
    help: { label: 'Contact us', href: CONTACT_HREF },
  },
};
