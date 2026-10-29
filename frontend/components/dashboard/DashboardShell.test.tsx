import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardShell } from './DashboardShell';
import { asRole } from './test-utils';

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard/overview', useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

// jsdom has no matchMedia; the theme toggle asks it for the system theme.
vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));

const navs = () => screen.getAllByRole('navigation', { name: 'Dashboard', hidden: true });
const texts = (el: HTMLElement) => within(el).queryAllByRole('link', { hidden: true }).map((a) => a.textContent);
/** The bar's own links (Order journey, Labs, Settings), with the Dashboard menu closed. */
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
  afterEach(cleanup);

  it('Order journey, a Dashboard menu of the reports (Orders in its slot), Labs and Settings; the drawer lists the same, in order', () => {
    render(<DashboardShell>x</DashboardShell>);
    expect(bar()).toEqual(['Order journey', 'Labs', 'Settings']);
    expect(reports()).toEqual(['Overview', 'Complaints', 'Warehouses', 'Carriers', 'Orders', 'Replay']);
    expect(drawer()).toEqual(['Order journey', 'Overview', 'Complaints', 'Warehouses', 'Carriers', 'Orders', 'Replay', 'Labs', 'Settings']);
  });

  it('AC-AUTH-15: the order desk sees Orders and only its reports', () => {
    render(<DashboardShell user={asRole('order_desk')}>x</DashboardShell>);
    expect(bar()).toEqual(['Order journey', 'Labs', 'Settings']);
    expect(reports()).toEqual(['Overview', 'Orders']);
  });

  it('AC-AUTH-15: leadership has no Orders, and the analytical reports', () => {
    render(<DashboardShell user={asRole('leadership')}>x</DashboardShell>);
    expect(bar()).toEqual(['Order journey', 'Labs', 'Settings']);
    expect(reports()).toEqual(['Overview', 'Warehouses', 'Carriers', 'Replay']);
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
