import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { vi } from 'vitest';

/** Mock fetch with a map of "path?query" -> JSON body. Unknown paths return 404. */
export function mockApi(routes: Record<string, unknown>) {
  const fn = vi.fn(async (url: string) => {
    const u = new URL(url);
    const path = u.pathname + u.search;
    const hit = Object.entries(routes).find(([p]) => path === p);
    return { ok: Boolean(hit), status: hit ? 200 : 404, json: async () => (hit ? hit[1] : { error: 'not found' }) } as Response;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

export const renderScreen = (node: ReactNode) => render(<>{node}</>);
