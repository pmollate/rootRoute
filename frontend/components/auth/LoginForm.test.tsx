import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const signIn = vi.fn();
vi.mock('next-auth/react', () => ({ signIn: (...a: unknown[]) => signIn(...a) }));
const assign = vi.fn();
vi.stubGlobal('location', { ...window.location, assign });

const { LoginForm } = await import('./LoginForm');

afterEach(() => { cleanup(); signIn.mockReset(); assign.mockReset(); });

const fill = (email: string, password: string) => {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with a demo account' }));
};

describe('LoginForm (/login, SPEC-auth §5.6)', () => {
  it('AC-SEC-AUTH-05: without AUTH_DEMO there is no demo form; the Microsoft button names the product\'s sign-in', () => {
    render(<LoginForm demo={false} entra next="/dashboard" />);
    expect(screen.getByRole('button', { name: 'Sign in with Microsoft' })).toBeTruthy();
    expect(screen.queryByLabelText('Password')).toBeNull();
  });

  it('AC-AUTH-02, AC-AUTH-01: a demo user signs in and goes back to the page asked for', async () => {
    signIn.mockResolvedValue({ ok: true, error: undefined, code: undefined, status: 200, url: '/' });
    render(<LoginForm demo entra next="/dashboard/journey?ref=delivery:D000213" />);
    fill('demo-leadership@latelens.test', 'pw');
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/dashboard/journey?ref=delivery:D000213'));
    expect(signIn).toHaveBeenCalledWith('demo', { email: 'demo-leadership@latelens.test', password: 'pw', redirect: false });
  });

  it('AC-SEC-AUTH-05: a failed sign-in shows one generic message; rate limiting its own', async () => {
    signIn.mockResolvedValue({ ok: false, error: 'CredentialsSignin', code: 'credentials', status: 401, url: null });
    render(<LoginForm demo entra next="/dashboard" />);
    fill('nobody@latelens.test', 'x');
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Sign-in failed. Check your email and password.');
    signIn.mockResolvedValue({ ok: false, error: 'CredentialsSignin', code: 'rate_limited', status: 401, url: null });
    fill('nobody@latelens.test', 'x');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Too many attempts. Try again in a minute.'));
    expect(assign).not.toHaveBeenCalled();
  });

  it('AC-AUTH-12: when Microsoft sign-in failed or is not set up, a plain message shows and the demo form still works', () => {
    render(<LoginForm demo entra={false} next="/dashboard" error="OAuthSignin" />);
    expect(screen.getByRole('alert').textContent).toBe('Microsoft sign-in is not available right now.');
    expect((screen.getByRole('button', { name: 'Sign in with Microsoft' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByLabelText('Password')).toBeTruthy();
  });

  it('AC-AUTH-08: after sign-out the page says it does not sign you out of Microsoft', () => {
    render(<LoginForm demo={false} entra next="/dashboard" signedOut />);
    expect(screen.getByText(/does not sign you out of Microsoft/)).toBeTruthy();
  });

  it('AC-AUTH-11: an ended session is explained', () => {
    render(<LoginForm demo entra next="/dashboard/intake" expired />);
    expect(screen.getByText('Your session has ended. Sign in again; your changes are kept.')).toBeTruthy();
  });
});
