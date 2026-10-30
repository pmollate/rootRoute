// REQ-ASK-04 figure check (SPEC §5.16): every number in the answer must be found in a tool result or the arguments of a
// tool that ran, never only in the question: as written, as a percentage of a rate (× 100), or rounded to the decimals
// shown. `$`, `%` and thousands separators are ignored; K, M and B scale a figure ("$738K", "$14.2M"). Code decides; the
// model's text is never trusted.

export interface Figure { value: number; decimals: number; scale: number; raw: string }

const SCALE: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9 };

/** Every number written in a text: "71.0%" -> 71.0, "$872,460" -> 872460, "$14.2M" -> 14.2 × 1e6, "2026-10-30" -> 2026, 10, 30 (no signs: a hyphen joins date parts). */
export function figuresIn(text: string): Figure[] {
  const out: Figure[] = [];
  for (const m of text.matchAll(/(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)([KMB](?![A-Za-z]))?/g)) {
    const plain = m[1].replace(/,/g, '');
    out.push({ value: Number(plain), decimals: plain.split('.')[1]?.length ?? 0, scale: m[2] ? SCALE[m[2]] : 1, raw: m[0] });
  }
  return out;
}

/** Every number anywhere in a JSON value (tool results and arguments), including numbers written inside strings. */
export function numbersIn(value: unknown, into: number[] = []): number[] {
  if (typeof value === 'number' && Number.isFinite(value)) into.push(value);
  else if (typeof value === 'string') for (const f of figuresIn(value)) into.push(f.value * f.scale);
  else if (Array.isArray(value)) for (const v of value) numbersIn(v, into);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) numbersIn(v, into);
  return into;
}

const round = (n: number, d: number) => Number(n.toFixed(d));

/**
 * True when `f` is one of `known`, as written, as a rate × 100, or rounded to the decimals `f` shows. A rate is only
 * rounded once it is a percentage: 0.7099 may be written 71% but not "1", or every 1 in an answer would pass.
 */
export function found(f: Figure, known: number[]): boolean {
  return known.some((k) => {
    const candidates = Math.abs(k) < 1 && k !== 0 ? [k * 100] : [k, k * 100];
    return k / f.scale === f.value || candidates.some((c) => round(c / f.scale, f.decimals) === f.value);
  });
}

/** The figures in `answer` that no source holds; empty means the answer is checked. */
export function uncheckedFigures(answer: string, sources: unknown[]): string[] {
  const known = sources.flatMap((s) => numbersIn(s));
  return figuresIn(answer).filter((f) => !found(f, known)).map((f) => f.raw);
}
