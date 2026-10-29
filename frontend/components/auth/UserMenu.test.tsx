import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const signOut = vi.fn();
vi.mock('next-auth/react', () => ({ signOut: (...a: unknown[]) => signOut(...a) }));

const { UserMenu } = await import('./UserMenu');

afterEach(() => { cleanup(); signOut.mockReset(); });

describe('header user menu (REQ-AUTH-08)', () => {
  it('AC-AUTH-09: the bar shows a profile icon with initials and the Logout symbol; the icon opens name, role and demo', () => {
    render(<UserMenu user={{ id: 'demo:demo-admin@rootroute.test', name: 'Demo admin', roles: ['admin'], demo: true }} />);
    expect(screen.getByRole('button', { name: 'Logout' }).textContent).toBe(''); // the symbol only
    const profile = screen.getByRole('button', { name: 'Profile: Demo admin' });
    expect(profile.textContent).toBe('DA');
    expect(screen.queryByText('Admin')).toBeNull();
    fireEvent.click(profile);
    expect(screen.getByText('Demo admin')).toBeTruthy();
    expect(screen.getByText('Admin')).toBeTruthy();
    expect(screen.getByText('Demo account')).toBeTruthy();
  });

  it('several roles are listed together; a real user has no demo line', () => {
    render(<UserMenu user={{ id: 'oid-1', name: 'Ann Admin', roles: ['admin', 'leadership'], demo: false }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Profile: Ann Admin' }));
    expect(screen.getByText('Admin, Leadership')).toBeTruthy();
    expect(screen.queryByText('Demo account')).toBeNull();
  });

  it('AC-AUTH-08: "Logout" ends the session and opens /login', () => {
    render(<UserMenu user={{ id: 'u1', name: 'Una', roles: ['order_desk'], demo: false }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    expect(signOut).toHaveBeenCalledWith({ redirectTo: '/login?signedOut=1' });
  });

  it('AUTH_REQUIRED=off without a session: nothing is shown, as before P7', () => {
    const { container } = render(<UserMenu user={null} />);
    expect(container.innerHTML).toBe('');
  });
});
