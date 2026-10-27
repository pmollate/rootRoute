import type { AddressCheck } from './address.js';
import type { Extraction } from './schema.js';

export type Decision = 'ALL_CLEAR' | 'CONFIRM_ADDRESS' | 'MISSING_INFO';

/** E5: decided by code from checked facts only; the model never sets the state (SEC-02). */
export function decide(clientId: string | null, extraction: Extraction | null, address: AddressCheck | null): Decision {
  if (!clientId || !extraction) return 'MISSING_INFO';
  const itemsOk = extraction.items.length > 0 && extraction.items.every((i) => i.sku.trim() !== '' && Number.isInteger(i.qty) && i.qty > 0);
  if (!itemsOk) return 'MISSING_INFO';
  if (!address || address.status === 'incomplete' || address.status === 'unverified') return 'CONFIRM_ADDRESS';
  return 'ALL_CLEAR';
}
