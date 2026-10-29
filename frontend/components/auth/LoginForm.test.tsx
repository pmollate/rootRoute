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
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
};

describe('LoginForm (/login, SPEC-auth §5.6)', () => {
  it('AC-SEC-AUTH-05: without AUTH_DEMO there is no form; there is never a Microsoft button', () => {
    render(<LoginForm demo={false} next="/dashboard" />);
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(screen.queryByText(/Microsoft/)).toBeNull();
  });

  it('AC-AUTH-02, AC-AUTH-01: a demo user signs in and goes back to the page asked for', async () => {
    signIn.mockResolvedValue({ ok: true, error: undefined, code: undefined, status: 200, url: '/' });
    render(<LoginForm demo next="/dashboard/journey?ref=delivery:D000213" />);
    fill('demo-leadership@rootroute.test', 'pw');
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/dashboard/journey?ref=delivery:D000213'));
    expect(signIn).toHaveBeenCalledWith('demo', { email: 'demo-leadership@rootroute.test', password: 'pw', redirect: false });
  });

  it('AC-SEC-AUTH-05: a failed sign-in shows one generic message; rate limiting its own', async () => {
    signIn.mockResolvedValue({ ok: false, error: 'CredentialsSignin', code: 'credentials', status: 401, url: null });
    render(<LoginForm demo next="/dashboard" />);
    fill('nobody@rootroute.test', 'x');
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Sign-in failed. Check your email and password.');
    signIn.mockResolvedValue({ ok: false, error: 'CredentialsSignin', code: 'rate_limited', status: 401, url: null });
    fill('nobody@rootroute.test', 'x');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Too many attempts. Try again in a minute.'));
    expect(assign).not.toHaveBeenCalled();
  });

  it('the page has only the email form: no Microsoft button, notice or divider', () => {
    render(<LoginForm demo next="/dashboard" />);
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.queryByText(/Microsoft/)).toBeNull();
    expect(screen.queryByText(/continue with email/)).toBeNull();
  });

  it('AC-AUTH-11: an ended session is explained', () => {
    render(<LoginForm demo next="/dashboard/intake" expired />);
    expect(screen.getByText('Your session has ended. Sign in again; your changes are kept.')).toBeTruthy();
  });
});
