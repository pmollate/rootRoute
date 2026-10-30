import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAssistantOn } from './assistant/AssistantFlag';
import { DashboardShell } from './DashboardShell';
import { asRole, mockApi } from './test-utils';

const nav = vi.hoisted(() => ({ path: '/dashboard/overview' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.path, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

// jsdom has no matchMedia; the theme toggle asks it for the system theme.
vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));

const navs = () => screen.getAllByRole('navigation', { name: 'Dashboard', hidden: true });
const texts = (el: HTMLElement) => within(el).queryAllByRole('link', { hidden: true }).map((a) => a.textContent);
/** The bar's own links (Orders, Labs, Settings), with the Dashboard menu closed. */
const bar = () => texts(navs()[0]);
/** The Dashboard menu's reports, once opened. */
const reports = () => {
  const button = screen.getByRole('button', { name: 'Dashboard' });
  fireEvent.click(button);
  return texts(document.getElementById(button.getAttribute('aria-controls')!)!);
};
/** The phone drawer: every destination in bar order. */
const drawer = () => texts(navs()[1]);

describe('dashboard navigation (master nav, REQ-AUTH-15)', () => {
  beforeEach(() => { mockApi({}); });
  afterEach(() => { cleanup(); nav.path = '/dashboard/overview'; });

  it('AC-ASK-08: without the flag no Ask Root Route button; AC-ASK-01: with it, the button is on the screen', () => {
    nav.path = '/dashboard/carriers';
    render(<DashboardShell>x</DashboardShell>);
    expect(screen.queryByRole('button', { name: 'Ask Root Route' })).toBeNull();
    cleanup();
    render(<DashboardShell assistant>x</DashboardShell>);
    expect(screen.getByRole('button', { name: 'Ask Root Route' })).toBeTruthy();
  });

  it('REQ-ASK-01: on Overview the dock is hidden (Router answers there) and the flag reaches the screen', () => {
    const Probe = () => <p>{useAssistantOn() ? 'flag on' : 'flag off'}</p>;
    render(<DashboardShell assistant><Probe /></DashboardShell>);
    expect(screen.queryByRole('button', { name: 'Ask Root Route' })).toBeNull();
    expect(screen.getByText('flag on')).toBeTruthy();
    cleanup();
    render(<DashboardShell><Probe /></DashboardShell>);
    expect(screen.getByText('flag off')).toBeTruthy();
  });

  it('a Dashboard menu of the reports, Orders, Labs and Settings; the drawer lists the same, in order', () => {
    render(<DashboardShell>x</DashboardShell>);
    expect(bar()).toEqual(['Orders', 'Labs', 'Settings']);
    expect(reports()).toEqual(['Overview', 'Complaints', 'Warehouses', 'Carriers', 'Order journey']);
    expect(drawer()).toEqual(['Overview', 'Complaints', 'Warehouses', 'Carriers', 'Order journey', 'Orders', 'Labs', 'Settings']);
  });

  it('AC-AUTH-15: the order desk sees Orders and only its reports; no Labs (Replay)', () => {
    render(<DashboardShell user={asRole('order_desk')}>x</DashboardShell>);
    expect(bar()).toEqual(['Orders', 'Settings']);
    expect(reports()).toEqual(['Overview', 'Order journey']);
  });

  it('AC-AUTH-15: leadership has no Orders, and the analytical reports', () => {
    render(<DashboardShell user={asRole('leadership')}>x</DashboardShell>);
    expect(bar()).toEqual(['Labs', 'Settings']);
    expect(reports()).toEqual(['Overview', 'Warehouses', 'Carriers', 'Order journey']);
  });

  it('the Dashboard menu reads as current on a report screen and marks that screen', () => {
    render(<DashboardShell>x</DashboardShell>);
    const button = screen.getByRole('button', { name: 'Dashboard' });
    expect(button.dataset.current).toBe('true');
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const menu = document.getElementById(button.getAttribute('aria-controls')!)!;
    expect(within(menu).getByRole('link', { name: 'Overview' }).getAttribute('aria-current')).toBe('page');
  });
});

describe('data line (AC-DATA-21: read from the API, no fixed figures)', () => {
  afterEach(() => cleanup());
  const OTHER = { deliveries: 1234, warehouses: 3, carriers: 4, windowFrom: '2026-11-03', windowTo: '2027-02-02', recentFrom: '2027-01-01' };

  it('AC-DATA-21: shows the window and counts the API returns', async () => {
    mockApi({ '/api/overview': OTHER });
    render(<DashboardShell>x</DashboardShell>);
    expect(await screen.findByText('Computed from the supplied Halcyon dataset · 1,234 deliveries · Nov 2026–Feb 2027 · 3 sites · 4 carriers.')).toBeTruthy();
    expect(screen.getAllByText('1,234 deliveries', { exact: false }).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain('48,340');
  });

  it('AC-DATA-21: while loading and on error, a neutral line and none of the old fixed numbers', async () => {
    const fetch = mockApi({});
    render(<DashboardShell>x</DashboardShell>);
    expect(screen.getByText('Computed from the supplied Halcyon dataset.')).toBeTruthy();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/overview'));
    expect(screen.getByText('Computed from the supplied Halcyon dataset.')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/48,340|Apr–Sep|5 sites|6 carriers/);
  });
});
