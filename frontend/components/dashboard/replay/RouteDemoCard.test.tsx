import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderScreen } from '../test-utils';
import { DEMO_CAVEAT, RouteDemoCard } from './RouteDemoCard';

const route = (over: Record<string, unknown> = {}) => ({
  synthetic: true, deliveryId: 'D000010', nStops: 3, stops: [[10, 0], [0, 10], [-10, 0]], plannedOrder: [0, 2, 1],
  optimisedOrder: [0, 1, 2], plannedKm: 80, optimisedKm: 68, actualKm: 100, overran: true, ...over,
});
const EXAMPLES = { synthetic: true, examples: [
  { deliveryId: 'D000010', kind: 'overrun' }, { deliveryId: 'D000001', kind: 'on_plan' }, { deliveryId: 'D000005', kind: 'no_distance' }] };

describe('Labs route reordering card (C9c, SPEC §5.19)', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('AC-RDEMO-05: badge, caveat, the three figures marked real or synthetic, and the example chips', async () => {
    mockApi({ '/api/labs/route-demo': EXAMPLES, '/api/labs/route-demo/D000010': route() });
    renderScreen(<RouteDemoCard />);
    expect(await screen.findByText('Synthetic data')).toBeTruthy();
    expect(screen.getByText(DEMO_CAVEAT)).toBeTruthy();
    expect(DEMO_CAVEAT).toBe("Stop positions are invented (SD-11): the saving shows what reordering does on these points, not on Halcyon's routes. The overrun compares the actual route with the plan, so a shorter plan does not change it.");
    const chips = screen.getByRole('group', { name: 'Example deliveries' });
    expect(within(chips).getAllByRole('button').map((b) => b.textContent)).toEqual(['D000010 · overran', 'D000001 · within 20%', 'D000005 · no distance']);
    fireEvent.click(within(chips).getByRole('button', { name: /D000010/ }));
    const figs = await screen.findByRole('list', { name: 'Route figures' });
    expect(within(figs).getByText('80.0 km')).toBeTruthy();
    expect(within(figs).getByText(/real, planned_route_km/)).toBeTruthy();
    expect(within(figs).getByText('68.0 km')).toBeTruthy();
    expect(within(figs).getByText(/synthetic, 15\.0% shorter than the plan/)).toBeTruthy();
    expect(within(figs).getByText('100.0 km')).toBeTruthy();
    expect(within(figs).getByText(/real, over plan by 25\.0%/)).toBeTruthy();
    expect(screen.getByRole('img', { name: /D000010: 3 invented stops/ })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/sign|vendor|approve/i);
  });

  it('AC-RDEMO-05: an overrun just past 20% prints two decimals', async () => {
    mockApi({ '/api/labs/route-demo': EXAMPLES, '/api/labs/route-demo/D000010': route({ plannedKm: 100, actualKm: 120.03 }) });
    renderScreen(<RouteDemoCard />);
    fireEvent.click(await screen.findByRole('button', { name: /D000010/ }));
    expect(await screen.findByText(/over plan by 20\.03%/)).toBeTruthy();
  });

  it('AC-RDEMO-05: no shorter order found is not shown as 0.0% shorter', async () => {
    mockApi({ '/api/labs/route-demo': EXAMPLES, '/api/labs/route-demo/D000010': route({ plannedKm: 80, optimisedKm: 80 }) });
    renderScreen(<RouteDemoCard />);
    fireEvent.click(await screen.findByRole('button', { name: /D000010/ }));
    expect(await screen.findByText(/no shorter order found/)).toBeTruthy();
    expect(screen.queryByText(/0\.0% shorter/)).toBeNull();
  });

  it('AC-RDEMO-05: no actual distance, a typed id, and a 404', async () => {
    mockApi({ '/api/labs/route-demo': EXAMPLES, '/api/labs/route-demo/D000005': route({ deliveryId: 'D000005', actualKm: null, overran: false }) });
    renderScreen(<RouteDemoCard />);
    const box = await screen.findByLabelText('Delivery id');
    fireEvent.change(box, { target: { value: 'd000005' } });
    fireEvent.submit(box.closest('form')!);
    expect(await screen.findByText(/no actual distance recorded/)).toBeTruthy();
    fireEvent.change(box, { target: { value: 'D999999' } });
    fireEvent.submit(box.closest('form')!);
    expect(await screen.findByText('No delivery with that id.')).toBeTruthy();
  });

  it('AC-RDEMO-05: the same id fetches again after an invalid submit', async () => {
    mockApi({ '/api/labs/route-demo': EXAMPLES, '/api/labs/route-demo/D000010': route() });
    renderScreen(<RouteDemoCard />);
    const chip = () => within(screen.getByRole('group', { name: 'Example deliveries' })).getByRole('button', { name: /D000010/ });
    fireEvent.click(await screen.findByRole('button', { name: /D000010/ }));
    expect(await screen.findByRole('list', { name: 'Route figures' })).toBeTruthy();
    const box = screen.getByLabelText('Delivery id');
    fireEvent.change(box, { target: { value: 'xyz' } });
    fireEvent.submit(box.closest('form')!);
    expect(await screen.findByText('No delivery with that id.')).toBeTruthy();
    fireEvent.click(chip());
    expect(await screen.findByRole('list', { name: 'Route figures' })).toBeTruthy();
    expect(screen.queryByText('No delivery with that id.')).toBeNull();
  });

  it('AC-RDEMO-05: an invalid submit while a request is pending keeps the error', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((res) => { release = res; });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/api/labs/route-demo')) return { ok: true, status: 200, json: async () => EXAMPLES } as Response;
      await gate;
      return { ok: true, status: 200, json: async () => route() } as Response;
    }));
    renderScreen(<RouteDemoCard />);
    fireEvent.click(await screen.findByRole('button', { name: /D000010/ }));
    const box = screen.getByLabelText('Delivery id');
    fireEvent.change(box, { target: { value: 'xyz' } });
    fireEvent.submit(box.closest('form')!);
    expect(await screen.findByText('No delivery with that id.')).toBeTruthy();
    release();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText('No delivery with that id.')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Route figures' })).toBeNull();
  });
});
