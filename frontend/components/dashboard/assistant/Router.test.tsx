import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OverviewScreen } from '@/components/dashboard/overview/OverviewScreen';
import { mockApi } from '../test-utils';
import { AssistantFlag } from './AssistantFlag';

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard/overview' }));

/** Enough of the Overview API for the screen to render; Router's figures are not under test here. */
const ROUTES = {
  '/api/overview': { onTime: 0.71, benchmark: 0.94, deliveries: 48340, late: 14019, penaltiesUsd: 872460, handlingCostUsd: 476646,
    atRiskAccounts: 9, atRiskRevenueUsd: 14200000, prePickupShare: 0.673 },
  '/api/attribution': { causes: [] },
  '/api/cause-kpis': { kpis: [] },
  '/api/replay?segment=all': { segment: 'all', scenarios: [] },
};
const AI = { questionId: 'q1', answer: 'Carrier D is late on Fridays. <img src="https://evil.example/x">', refused: false, checked: false,
  sources: [{ tool: 'lanes', args: { carrier: 'D' }, result: { onTime: 0.6 } }], toolCalls: 1, skipped: [] };

const router = () => screen.getByRole('region', { name: 'Router', hidden: true });
function followUp(q: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Open Router' }));
  fireEvent.change(within(router()).getByLabelText('Ask a follow-up'), { target: { value: q } });
  fireEvent.click(within(router()).getByRole('button', { name: 'Send' }));
}

describe('Overview Router follow-ups (D10)', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('REQ-ASK-01, REQ-ASK-04, SEC-ASK-06: with the flag on, a typed follow-up is answered by POST /api/assistant as plain text', async () => {
    const fetch = mockApi({ ...ROUTES, '/api/assistant': AI });
    const { container } = render(<AssistantFlag on><OverviewScreen /></AssistantFlag>);
    followUp('Why is carrier D late?');
    const r = router();
    expect(await within(r).findByText(AI.answer)).toBeTruthy();
    expect(within(r).getByText('Figures not checked')).toBeTruthy();
    expect(within(r).getByText('Sources (1)')).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
    const call = fetch.mock.calls.find((c) => String(c[0]) === '/api/assistant') as unknown as [string, RequestInit];
    expect(JSON.parse(String(call[1].body))).toEqual({ question: 'Why is carrier D late?', history: [] });
    expect(r.querySelector('[aria-live="polite"]')).toBeTruthy();
  });

  it('AC-ASK-14: a follow-up on Overview sends the opening question and the plan on screen first, so it can refer to them', async () => {
    const replay = { segment: 'all', scenarios: [
      { scenario: 'adopt_address', label: '+ address check (85%)', grp: 'adoption', onTime: 0.762 },
      { scenario: 'adopt_lanes', label: '+ lane rules and Friday cap (90%)', grp: 'adoption', onTime: 0.825 }] };
    const attribution = { causes: [
      { cause: 'f_lane', label: 'Carrier lane / Friday overload', stage: 'Carrier', deliveries: 10030, pointsLost: 0.0763, share: 0.263 },
      { cause: 'f_addr', label: 'Incomplete address', stage: 'Intake', deliveries: 5994, pointsLost: 0.0705, share: 0.243 }] };
    const fetch = mockApi({ ...ROUTES, '/api/attribution': attribution, '/api/replay?segment=all': replay,
      '/api/assistant': { ...AI, answer: 'The address check.' } });
    render(<AssistantFlag on><OverviewScreen /></AssistantFlag>);
    await screen.findAllByText(/\+5\.2/);
    followUp('Who owns the first fix?');
    await within(router()).findByText('The address check.');
    const call = fetch.mock.calls.find((c) => String(c[0]) === '/api/assistant') as unknown as [string, RequestInit];
    const { history } = JSON.parse(String(call[1].body)) as { history: { role: string; text: string }[] };
    expect(history[0]).toEqual({ role: 'user', text: 'How do we close the gap to our 95% on-time target?' });
    expect(history[1].role).toBe('assistant');
    expect(history[1].text).toMatch(/One fix per cause.*1\. .*\+5\.2 points, to 76\.2%/);
  });

  it('REQ-ASK-01: the suggestion chips keep their worked-out answers and call no model', async () => {
    const fetch = mockApi({ ...ROUTES, '/api/assistant': AI });
    render(<AssistantFlag on><OverviewScreen /></AssistantFlag>);
    fireEvent.click(screen.getByRole('button', { name: 'Open Router' }));
    fireEvent.click(within(router()).getByRole('button', { name: 'Who owns each fix?' }));
    expect(within(router()).getAllByText('Who owns each fix?').length).toBe(2);
    expect(fetch.mock.calls.some((c) => String(c[0]) === '/api/assistant')).toBe(false);
  });

  it('REQ-ASK-08: with the flag off, a typed follow-up gets the worked-out answer and calls no model', async () => {
    const fetch = mockApi({ ...ROUTES, '/api/assistant': AI });
    render(<OverviewScreen />);
    followUp('Why is carrier D late?');
    expect(within(router()).getByText(/Carrier D on Fridays is a capacity problem/)).toBeTruthy();
    expect(fetch.mock.calls.some((c) => String(c[0]) === '/api/assistant')).toBe(false);
  });

  it('SEC-ASK-02 (Router side): an error shows the fixed message and puts the question back', async () => {
    const routes = mockApi(ROUTES);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url === '/api/assistant'
      ? { ok: false, status: 429, json: async () => ({ error: 'rate_limited' }) } as Response : routes(url))));
    render(<AssistantFlag on><OverviewScreen /></AssistantFlag>);
    followUp('Why is carrier D late?');
    expect((await within(router()).findByRole('alert')).textContent).toBe('Too many questions in a minute. Try again shortly.');
    expect((within(router()).getByLabelText('Ask a follow-up') as HTMLInputElement).value).toBe('Why is carrier D late?');
  });
});
