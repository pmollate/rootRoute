import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const signOut = vi.fn();
vi.mock('next-auth/react', () => ({ signOut: (...a: unknown[]) => signOut(...a) }));

const { UserMenu } = await import('./UserMenu');

afterEach(() => { cleanup(); signOut.mockReset(); });

describe('header user menu (REQ-AUTH-08, -09)', () => {
  it('AC-AUTH-09: a demo order_desk user sees their name, the role badge and "Demo account"', () => {
    render(<UserMenu user={{ id: 'demo:demo-order_desk@rootroute.test', name: 'Demo order desk', roles: ['order_desk'], demo: true }} />);
    expect(screen.getByText('Demo order desk')).toBeTruthy();
    expect(screen.getByText('Order desk')).toBeTruthy();
    expect(screen.getByText('Demo account')).toBeTruthy();
  });

  it('a real user has no demo badge; several roles show as several badges', () => {
    render(<UserMenu user={{ id: 'oid-1', name: 'Ann Admin', roles: ['admin', 'leadership'], demo: false }} />);
    expect(screen.queryByText('Demo account')).toBeNull();
    expect(screen.getByText('Admin')).toBeTruthy();
    expect(screen.getByText('Leadership')).toBeTruthy();
  });

  it('AC-AUTH-08: "Sign out" ends the session and opens /login', () => {
    render(<UserMenu user={{ id: 'u1', name: 'Una', roles: ['order_desk'], demo: false }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalledWith({ redirectTo: '/login?signedOut=1' });
  });

  it('AUTH_REQUIRED=off without a session: nothing is shown, as before P7', () => {
    const { container } = render(<UserMenu user={null} />);
    expect(container.innerHTML).toBe('');
  });
});
