import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Region } from '../../core/contracts.js';

const REF = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../../synthetic-data/reference/state_regions.json', import.meta.url)), 'utf8'),
) as { regions: Record<Region, string[]> };

const STATE_REGION = new Map<string, Region>(
  (Object.entries(REF.regions) as [Region, string[]][]).flatMap(([region, states]) => states.map((s) => [s, region])),
);

export function isUsState(state: string): boolean {
  return STATE_REGION.has(state.toUpperCase());
}

export function regionOfState(state: string): Region | null {
  return STATE_REGION.get(state.toUpperCase()) ?? null;
}
