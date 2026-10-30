// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ATLAS_VERSION, atlasUrl, readAtlas } from './atlas';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { dependencies: Record<string, string> };
const installed = JSON.parse(readFileSync(new URL('../../node_modules/azure-maps-control/package.json', import.meta.url), 'utf8')) as { version: string };

describe('Azure Maps Web SDK served from the app itself (E19, SEC-LINK-07, -08)', () => {
  it('SEC-LINK-07: the SDK is pinned to one exact version, the one installed and the one the page asks for', () => {
    expect(pkg.dependencies['azure-maps-control']).toBe(ATLAS_VERSION);
    expect(ATLAS_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(installed.version).toBe(ATLAS_VERSION);
    expect(atlasUrl('atlas.min.js')).toBe(`/confirm-map/${ATLAS_VERSION}/atlas.min.js`);
  });

  it('SEC-LINK-07: only the SDK script and its stylesheet are served, with their types; nothing else from node_modules', async () => {
    const js = await readAtlas(ATLAS_VERSION, 'atlas.min.js');
    expect(js?.type).toBe('text/javascript; charset=utf-8');
    expect(js?.body.length).toBeGreaterThan(100_000);
    expect((await readAtlas(ATLAS_VERSION, 'atlas.min.css'))?.type).toBe('text/css; charset=utf-8');
    for (const [v, f] of [['3.0.0', 'atlas.min.js'], [ATLAS_VERSION, 'package.json'], [ATLAS_VERSION, '../package.json'],
      [ATLAS_VERSION, 'atlas-esm.min.js']]) expect(await readAtlas(v, f), `${v}/${f}`).toBeNull();
  });

  it('AC-SEC-LINK-08: the SDK file holds no Maps key: it authenticates only with the SAS token the API issues', async () => {
    const js = (await readAtlas(ATLAS_VERSION, 'atlas.min.js'))!.body.toString('utf8');
    expect(js).not.toMatch(/NEXT_PUBLIC_[A-Z_]*MAPS/);
    expect(js).not.toContain('AZURE_MAPS_KEY');
  });
});
