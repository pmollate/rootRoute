// Public entry point of the Carriers area (CONTRACTS §2). STUB until Task C4.
import type { CarriersApi } from '../../core/contracts.js';

export const carriersApi: CarriersApi = {
  recommendCarrier: async () => ({ carrier: 'A', backup: 'B', reason: 'stub', blocked: [], options: [] }),
};
