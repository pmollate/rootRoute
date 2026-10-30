import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAssistantOn } from './assistant/AssistantFlag';
import { DashboardShell } from './DashboardShell';
import { asRole } from './test-utils';

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
  afterEach(() => { cleanup(); nav.path = '/dashboard/overview'; });

  it('AC-ASK-08: without the flag no Ask LateLens button; AC-ASK-01: with it, the button is on the screen', () => {
    nav.path = '/dashboard/carriers';
    render(<DashboardShell>x</DashboardShell>);
    expect(screen.queryByRole('button', { name: 'Ask LateLens' })).toBeNull();
    cleanup();
    render(<DashboardShell assistant>x</DashboardShell>);
    expect(screen.getByRole('button', { name: 'Ask LateLens' })).toBeTruthy();
  });

  it('REQ-ASK-01: on Overview the dock is hidden (Router answers there) and the flag reaches the screen', () => {
    const Probe = () => <p>{useAssistantOn() ? 'flag on' : 'flag off'}</p>;
    render(<DashboardShell assistant><Probe /></DashboardShell>);
    expect(screen.queryByRole('button', { name: 'Ask LateLens' })).toBeNull();
    expect(screen.getByText('flag on')).toBeTruthy();
    cleanup();
    render(<DashboardShell><Probe /></DashboardShell>);
    expect(screen.getByText('flag off')).toBeTruthy();
  });

  it('a Dashboard menu of the reports, Orders, Labs and Settings; the drawer lists the same, in order', () => {
    render(<DashboardShell>x</DashboardShell>);
    expect(bar()).toEqual(['Orders', 'Labs', 'Settings']);
    expect(reports()).toEqual(['Overview', 'Complaints', 'Warehouses', 'Carriers', 'Order journey', 'Replay']);
    expect(drawer()).toEqual(['Overview', 'Complaints', 'Warehouses', 'Carriers', 'Order journey', 'Replay', 'Orders', 'Labs', 'Settings']);
  });

  it('AC-AUTH-15: the order desk sees Orders and only its reports', () => {
    render(<DashboardShell user={asRole('order_desk')}>x</DashboardShell>);
    expect(bar()).toEqual(['Orders', 'Labs', 'Settings']);
    expect(reports()).toEqual(['Overview', 'Order journey']);
  });

  it('AC-AUTH-15: leadership has no Orders, and the analytical reports', () => {
    render(<DashboardShell user={asRole('leadership')}>x</DashboardShell>);
    expect(bar()).toEqual(['Labs', 'Settings']);
    expect(reports()).toEqual(['Overview', 'Warehouses', 'Carriers', 'Order journey', 'Replay']);
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
