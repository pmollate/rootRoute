import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardShell } from './DashboardShell';
import { asRole } from './test-utils';

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard/overview', useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

// jsdom has no matchMedia; the theme toggle asks it for the system theme.
vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));

/** The links of the bar and of the phone drawer, which must match. */
const links = () => {
  const [bar, ...rest] = screen.getAllByRole('navigation', { name: 'Dashboard', hidden: true })
    .map((nav) => within(nav).getAllByRole('link', { hidden: true }).map((a) => a.textContent));
  for (const other of rest) expect(other).toEqual(bar);
  return bar;
};

describe('dashboard navigation (REQ-AUTH-15)', () => {
  afterEach(cleanup);
  it('AC-AUTH-15: the bar lists only the screens the role may open', () => {
    render(<DashboardShell user={asRole('order_desk')}>x</DashboardShell>);
    expect(links()).toEqual(['Overview', 'Order emails', 'Order journey']);
  });

  it('AC-AUTH-15: leadership sees the analytical screens, not the email or complaint queues', () => {
    render(<DashboardShell user={asRole('leadership')}>x</DashboardShell>);
    expect(links()).toEqual(['Overview', 'Warehouses', 'Carriers', 'Order journey', 'Replay']);
  });

  it('with nobody signed in (AUTH_REQUIRED=off) every screen shows, as before', () => {
    render(<DashboardShell>x</DashboardShell>);
    expect(links()).toHaveLength(7);
  });
});
