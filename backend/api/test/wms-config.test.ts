import { describe, expect, it } from 'vitest';
import { checkWms } from '../src/core/config.js';

describe('WMS settings', () => {
  it('WMS_URL without WMS_TOKEN refuses to start; either alone, or both, pass', () => {
    expect(() => checkWms({ WMS_URL: 'http://localhost:4010', WMS_TOKEN: undefined })).toThrow('WMS_URL needs WMS_TOKEN: refusing to start');
    expect(() => checkWms({ WMS_URL: 'http://localhost:4010', WMS_TOKEN: 'x'.repeat(16) })).not.toThrow();
    expect(() => checkWms({ WMS_URL: undefined, WMS_TOKEN: undefined })).not.toThrow();
    expect(() => checkWms({ WMS_URL: undefined, WMS_TOKEN: 'x'.repeat(16) })).not.toThrow();
  });
});
