import { describe, expect, it } from 'vitest';
import { figuresIn, uncheckedFigures } from '../../src/modules/assistant/figures.js';

const OVERVIEW = { onTimeRate: 0.7099, late: 14019, penalties: 872460, benchmark: 0.94 };

describe('figure check (REQ-ASK-04)', () => {
  it('reads figures with $, % and thousands separators', () => {
    expect(figuresIn('On-time is 71.0% (14,019 late, $872,460 in penalties).').map((f) => f.value)).toEqual([71.0, 14019, 872460]);
  });

  it('AC-ASK-04: 71.0% is found in a 0.7099 rate (× 100, rounded to the decimals shown); 80% is not', () => {
    expect(uncheckedFigures('Our on-time rate is 71.0% against a 94% benchmark.', [OVERVIEW])).toEqual([]);
    expect(uncheckedFigures('Our on-time rate is 80%.', [OVERVIEW])).toEqual(['80']);
  });

  it('a figure from the question or the tool arguments counts as found', () => {
    expect(uncheckedFigures('For orders received at 09:15 the promise is 30 Oct.', [{ promiseDate: '2026-10-30' }, 'received at 09:15']))
      .toEqual([]);
  });

  it('a number the tools never returned is caught even when it is close', () => {
    expect(uncheckedFigures('14,020 deliveries were late.', [OVERVIEW])).toEqual(['14,020']);
  });
});
