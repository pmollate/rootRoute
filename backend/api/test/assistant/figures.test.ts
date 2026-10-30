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

  it('a rate is rounded only as a percentage: 0.7099 does not make "1" or "0" pass', () => {
    expect(uncheckedFigures('1 carrier is blocked; 0 lanes are fine.', [OVERVIEW])).toEqual(['1', '0']);
    expect(uncheckedFigures('A rate of 0.7099.', [OVERVIEW])).toEqual([]);
  });

  it('K, M and B scale a figure: $872K and $0.9M pass for 872,460; $14.2M does not', () => {
    expect(uncheckedFigures('Penalties were $872K, about $0.9M.', [OVERVIEW])).toEqual([]);
    expect(uncheckedFigures('Penalties were $14.2M.', [OVERVIEW])).toEqual(['14.2M']);
  });

  it('a number the tools never returned is caught even when it is close', () => {
    expect(uncheckedFigures('14,020 deliveries were late.', [OVERVIEW])).toEqual(['14,020']);
  });
});
