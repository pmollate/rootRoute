import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { vi } from 'vitest';
import { UserProvider } from '@/components/auth/UserContext';
import type { SessionUser } from '@/lib/auth/roles';

/** Mock fetch with a map of "path?query" -> JSON body. Unknown paths return 404. The dashboard calls same-origin paths. */
export function mockApi(routes: Record<string, unknown>) {
  const fn = vi.fn(async (url: string) => {
    const u = new URL(url, 'http://localhost');
    const path = u.pathname + u.search;
    const hit = Object.entries(routes).find(([p]) => path === p);
    return { ok: Boolean(hit), status: hit ? 200 : 404, json: async () => (hit ? hit[1] : { error: 'not found' }) } as Response;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** Renders a screen, signed in as `user` when given (P7); without one, as before sign-in existed (nothing hidden). */
export const renderScreen = (node: ReactNode, user: SessionUser | null = null) =>
  render(<UserProvider user={user}>{node}</UserProvider>);

export const asRole = (role: SessionUser['roles'][number]): SessionUser =>
  ({ id: `demo:demo-${role}@rootroute.test`, name: `Demo ${role}`, roles: [role], demo: true });
