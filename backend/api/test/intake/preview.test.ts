import { describe, expect, it } from 'vitest';
import { preview } from '../../src/modules/intake/routes.js';

describe('inbox preview', () => {
  it('skips the greeting and joins the first lines, up to 140 characters', () => {
    expect(preview('Hi,\n\nPlease use 400 S Orange Ave, Dock 2.\nThanks,\nSam')).toBe('Please use 400 S Orange Ave, Dock 2. Thanks, Sam');
    expect(preview('PURCHASE ORDER\nShip to:\nDock 2')).toBe('PURCHASE ORDER Ship to: Dock 2');
    expect(preview('x'.repeat(200))).toHaveLength(140);
  });
});
