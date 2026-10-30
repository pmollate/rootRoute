import { describe, expect, it } from 'vitest';
import { instantOf, toMailbox, toViewer } from './mailTime';

const NY = 'America/New_York';

describe('email times in the viewer\'s zone', () => {
  it('shows a New York arrival time in the viewer\'s zone, by each zone\'s daylight-saving rules', () => {
    expect(toViewer('2026-10-21 07:27', NY, 'Asia/Kolkata')).toBe('2026-10-21 16:57');   // EDT, UTC-4
    expect(toViewer('2026-12-01 07:27', NY, 'Asia/Kolkata')).toBe('2026-12-01 17:57');   // EST, UTC-5
    expect(toViewer('2026-10-21 22:15', NY, 'Asia/Kolkata')).toBe('2026-10-22 07:45');   // the next day
    expect(toViewer('2026-10-21 07:27', NY, 'America/Los_Angeles')).toBe('2026-10-21 04:27');
    expect(toViewer('2026-10-21 07:27', NY, NY)).toBe('2026-10-21 07:27');
  });

  it('turns a time the viewer typed back into the mailbox\'s wall clock', () => {
    expect(toMailbox('2026-10-21 16:57', NY, 'Asia/Kolkata')).toBe('2026-10-21 07:27');
    expect(toMailbox('2026-09-14 09:30', NY, 'Europe/London')).toBe('2026-09-14 04:30');
  });

  it('keeps the stored time when the API sends no zone (older API) or the text is not a time', () => {
    expect(toViewer('2026-10-21 07:27', undefined, 'Asia/Kolkata')).toBe('2026-10-21 07:27');
    expect(toMailbox('2026-10-21 07:27', null, 'Asia/Kolkata')).toBe('2026-10-21 07:27');
    expect(toViewer('', NY, 'Asia/Kolkata')).toBe('');
  });

  it('reads a wall clock as the right instant on either side of a daylight-saving change', () => {
    expect(new Date(instantOf('2026-03-07 12:00', NY)).toISOString()).toBe('2026-03-07T17:00:00.000Z');
    expect(new Date(instantOf('2026-03-09 12:00', NY)).toISOString()).toBe('2026-03-09T16:00:00.000Z');
  });
});
