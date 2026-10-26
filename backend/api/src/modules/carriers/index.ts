// Public entry point of the Carriers area (CONTRACTS §2). Other areas import only this file.
import type { CarriersApi } from '../../core/contracts.js';
import { isFriday, recommendFromLane } from './domain.js';
import { capacityLimits, laneRows, logRecommendation, usedToday } from './queries.js';

export const carriersApi: CarriersApi = {
  async recommendCarrier({ region, commitment, slaClause, date }) {
    const day = date ?? new Date().toISOString().slice(0, 10);
    const limits = await capacityLimits(region, isFriday(day));
    const rec = recommendFromLane(await laneRows(region, commitment), slaClause, await usedToday(region, day), limits);
    await logRecommendation({ orderRef: null, region, commitment, carrier: rec.carrier, backup: rec.backup, reason: rec.reason, date: day });
    return rec;
  },
};
