import { describe, expect, it } from 'vitest';
import { parseClientEmails } from '../../src/modules/intake/seedTables.js';

describe('E16 CLIENT_EMAILS test senders', () => {
  it('AC-INT-10: reads email:client_id pairs, lower-cases the address and skips blanks', () => {
    expect(parseClientEmails(' Someone@Gmail.com:C190 , ,other@gmail.com:C007,')).toEqual([
      { email: 'someone@gmail.com', client_id: 'C190' },
      { email: 'other@gmail.com', client_id: 'C007' },
    ]);
  });

  it('AC-INT-10: unset or empty means no test senders', () => {
    expect(parseClientEmails(undefined)).toEqual([]);
    expect(parseClientEmails('')).toEqual([]);
  });

  it('AC-INT-10: a malformed pair stops the seed instead of registering half a list', () => {
    for (const bad of ['someone@gmail.com', 'gmail.com:C190', 'someone@gmail.com:190', 'a@b.com:C190:x']) {
      expect(() => parseClientEmails(bad)).toThrow(/CLIENT_EMAILS/);
    }
  });
});
