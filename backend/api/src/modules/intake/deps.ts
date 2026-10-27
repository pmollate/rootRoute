import { createGmailClient } from '../../core/gmail.js';
import { createLLM } from '../../core/llm/index.js';
import { createAddressValidator } from '../../core/maps/index.js';
import { createPiiDetector } from '../../core/pii/index.js';
import { carriersApi } from '../carriers/index.js';
import { warehouseApi } from '../warehouse/index.js';
import type { Deps } from './pipeline.js';
import { repo } from './repo.js';

let current: Deps | null = null;

/** Gmail is optional: without GMAIL_* the paste form still works, and sending says it is not set up. */
function gmailOrNull(): Deps['gmail'] {
  try {
    return createGmailClient();
  } catch {
    return null;
  }
}

export function getDeps(): Deps {
  current ??= { llm: createLLM(), pii: createPiiDetector(), maps: createAddressValidator(), repo,
    warehouse: warehouseApi, carriers: carriersApi, gmail: gmailOrNull() };
  return current;
}

/** Tests swap in a fake model, Gmail or stubs for other areas. */
export function setDeps(overrides: Partial<Deps>): void {
  current = { ...getDeps(), ...overrides };
}
