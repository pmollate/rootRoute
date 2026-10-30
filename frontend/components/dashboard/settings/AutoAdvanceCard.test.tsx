import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { asRole, mockApi, renderScreen } from '../test-utils';
import { AutoAdvanceCard } from './AutoAdvanceCard';

/** The bodies POSTed to the setting, in order. */
const posts = (fetch: ReturnType<typeof mockApi>) => (fetch.mock.calls as unknown as [string, RequestInit?][])
  .filter(([url, init]) => url.endsWith('/api/settings/auto-advance') && init?.method === 'POST')
  .map(([, init]) => JSON.parse(String(init!.body)));
const toggle = async () => {
  const sw = await screen.findByRole('switch', { name: /Auto-advance approved orders/ }) as HTMLInputElement;
  return sw;
};

describe('Auto-advance setting', () => {
  afterEach(cleanup);

  it('AC-SET-02: an admin turns it on', async () => {
    const fetch = mockApi({ '/api/settings': { autoAdvance: false }, '/api/settings/auto-advance': { autoAdvance: true } });
    renderScreen(<AutoAdvanceCard />, asRole('admin'));
    const sw = await toggle();
    await waitFor(() => expect(sw.disabled).toBe(false));
    fireEvent.click(sw);
    await waitFor(() => expect(posts(fetch)).toEqual([{ enabled: true }]));
    expect(sw.checked).toBe(true);
  });

  it('AC-SET-02: the order desk sees the state but cannot change it', async () => {
    mockApi({ '/api/settings': { autoAdvance: true } });
    renderScreen(<AutoAdvanceCard />, asRole('order_desk'));
    const sw = await toggle();
    await waitFor(() => expect(sw.checked).toBe(true));
    expect(sw.disabled).toBe(true);
    expect(screen.getByText('Only an admin can change this.')).toBeTruthy();
  });

  it('a failed save puts the switch back and says why', async () => {
    mockApi({ '/api/settings': { autoAdvance: false } }); // the POST path is not mapped: 404
    renderScreen(<AutoAdvanceCard />, asRole('admin'));
    const sw = await toggle();
    await waitFor(() => expect(sw.disabled).toBe(false));
    fireEvent.click(sw);
    expect((await screen.findByRole('alert')).textContent).toMatch(/^Not saved/);
    expect(sw.checked).toBe(false);
  });

  it('a failed load disables the switch and says so', async () => {
    mockApi({}); // GET not mapped: 404
    renderScreen(<AutoAdvanceCard />, asRole('admin'));
    expect((await screen.findByRole('alert')).textContent).toMatch(/^Could not load the setting/);
    expect((await toggle()).disabled).toBe(true);
  });
});
