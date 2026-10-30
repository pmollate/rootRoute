import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmMap } from './ConfirmMap';

/** A stand-in for the Azure Maps SDK on `window.atlas`: records the camera calls and lets a test fire `ready`. */
function fakeAtlas() {
  const handlers: Record<string, (() => void)[]> = {};
  let zoom = 16;
  let position: [number, number] = [-117.3075, 45.4109];
  const camera = vi.fn((c: { zoom?: number; center?: [number, number] }) => { if (c.zoom !== undefined) zoom = c.zoom; });
  class Map {
    events = { add: (name: string, a: unknown, b?: unknown) => { const fn = (typeof a === 'function' ? a : b) as () => void; (handlers[name] ??= []).push(fn); } };
    markers = { add: () => {} };
    setCamera = camera;
    getCamera = () => ({ zoom });
    dispose = () => {};
  }
  class HtmlMarker {
    getOptions = () => ({ position });
    setOptions = (o: { position: [number, number] }) => { position = o.position; };
  }
  (window as unknown as { atlas: unknown }).atlas = { Map, HtmlMarker, AuthenticationType: { sas: 'sas' } };
  return { camera, fire: (name: string) => handlers[name]?.forEach((h) => h()), moveMarker: (p: [number, number]) => { position = p; } };
}

const CRED = { kind: 'sas' as const, token: 't', expiresAt: '2026-10-31T10:00:00Z' };

describe('ConfirmMap controls (31 Oct)', () => {
  afterEach(() => { cleanup(); delete (window as unknown as { atlas?: unknown }).atlas; });

  it('shows zoom in, zoom out and recenter once the map is ready; they move the camera, and recenter goes to the pin', async () => {
    const atlas = fakeAtlas();
    render(<ConfirmMap pin={{ lat: 45.4109, lon: -117.3075 }} credential={CRED} onMove={() => {}} onFail={() => {}} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole('button', { name: 'Zoom in' })).toBeNull(); // not before the map is ready
    await act(async () => { atlas.fire('ready'); });
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(atlas.camera).toHaveBeenLastCalledWith(expect.objectContaining({ zoom: 17 }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(atlas.camera).toHaveBeenLastCalledWith(expect.objectContaining({ zoom: 15 }));
    atlas.moveMarker([-117.31, 45.42]); // the client dragged the pin elsewhere
    fireEvent.click(screen.getByRole('button', { name: 'Recenter on the pin' }));
    expect(atlas.camera).toHaveBeenLastCalledWith(expect.objectContaining({ center: [-117.31, 45.42], zoom: 16 }));
  });
});
