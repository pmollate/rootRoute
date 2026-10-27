import { config } from '../config.js';
import { AzureLanguagePii } from './azureLanguage.js';
import { RecordedPii, RecordingPii } from './recorded.js';
import type { PiiDetector } from './types.js';

export function createPiiDetector(): PiiDetector {
  if (config.PII_PROVIDER === 'recorded') return new RecordedPii();
  const { AZURE_LANGUAGE_ENDPOINT: endpoint, AZURE_LANGUAGE_KEY: key } = config;
  if (!endpoint || !key) throw new Error('PII_PROVIDER=azure-language needs AZURE_LANGUAGE_ENDPOINT and AZURE_LANGUAGE_KEY in .env');
  const real = new AzureLanguagePii(endpoint, key);
  return config.RECORD === '1' ? new RecordingPii(real) : real;
}

export * from './redact.js';
export * from './types.js';
