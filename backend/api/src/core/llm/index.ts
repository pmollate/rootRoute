import { config } from '../config.js';
import { AzureOpenAILLM } from './azureOpenai.js';
import { RecordedLLM, RecordingLLM } from './recorded.js';
import type { LLM } from './types.js';

export function createLLM(): LLM {
  if (config.LLM_PROVIDER === 'recorded') return new RecordedLLM();
  const { AZURE_OPENAI_ENDPOINT: endpoint, AZURE_OPENAI_API_KEY: apiKey, AZURE_OPENAI_DEPLOYMENT: deployment } = config;
  if (!endpoint || !apiKey || !deployment) {
    throw new Error('LLM_PROVIDER=azure-openai needs AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY and AZURE_OPENAI_DEPLOYMENT in .env');
  }
  const real = new AzureOpenAILLM(endpoint, apiKey, deployment);
  return config.RECORD === '1' ? new RecordingLLM(real) : real;
}

export * from './types.js';
