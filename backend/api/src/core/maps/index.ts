import { config } from '../config.js';
import { AzureMapsValidator } from './azureMaps.js';
import { RecordedAddressValidator, RecordingAddressValidator } from './recorded.js';
import type { AddressValidator } from './types.js';

export function createAddressValidator(): AddressValidator {
  if (config.ADDRESS_PROVIDER === 'recorded') return new RecordedAddressValidator();
  if (!config.AZURE_MAPS_KEY) throw new Error('ADDRESS_PROVIDER=azure-maps needs AZURE_MAPS_KEY in .env');
  const real = new AzureMapsValidator(config.AZURE_MAPS_KEY);
  return config.RECORD === '1' ? new RecordingAddressValidator(real) : real;
}

export * from './types.js';
