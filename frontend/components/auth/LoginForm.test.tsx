import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const assign = vi.fn();
vi.stubGlobal('location', { ...window.location, assign });

/** Auth.js answers the callback POST with `{ url }`; a failure names the error and code in that URL's query. */
let callbackUrl = 'http://localhost/dashboard';
const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
  const body = url === '/api/auth/csrf' ? { csrfToken: 'tok' } : { url: callbackUrl };
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
});
vi.stubGlobal('fetch', fetchMock);
const signInCalls = () => fetchMock.mock.calls.filter(([u]) => u === '/api/auth/callback/demo');

const { LoginForm } = await import('./LoginForm');

afterEach(() => { cleanup(); fetchMock.mockClear(); assign.mockReset(); callbackUrl = 'http://localhost/dashboard'; });

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
    render(<LoginForm demo next="/dashboard/journey?ref=delivery:D000213" />);
    fill('demo-leadership@rootroute.test', 'pw');
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/dashboard/journey?ref=delivery:D000213'));
    const [[, init]] = signInCalls();
    expect(Object.fromEntries(init!.body as URLSearchParams)).toEqual({ email: 'demo-leadership@rootroute.test', password: 'pw', csrfToken: 'tok' });
  });

  it('shows what it is doing until the dashboard replaces the page, and ignores a second press', async () => {
    render(<LoginForm demo next="/dashboard" />);
    fill('demo-leadership@rootroute.test', 'pw');
    expect(await screen.findByRole('button', { name: 'Opening your dashboard…' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('status').textContent).toBe('Opening your dashboard…');
    fireEvent.submit(screen.getByRole('button', { name: 'Opening your dashboard…' }));
    expect(signInCalls()).toHaveLength(1);
  });

  it('AC-SEC-AUTH-05: a failed sign-in shows one generic message; rate limiting its own', async () => {
    callbackUrl = 'http://localhost/login?error=CredentialsSignin&code=credentials';
    render(<LoginForm demo next="/dashboard" />);
    fill('nobody@rootroute.test', 'x');
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Sign-in failed. Check your email and password.');
    callbackUrl = 'http://localhost/login?error=CredentialsSignin&code=rate_limited';
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
