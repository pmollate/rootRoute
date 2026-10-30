// REQ-ASK-04 figure check (SPEC §5.16): every number in the answer must be found in a tool result, the question or the
// tool arguments: as written, as a percentage of a rate (× 100), or rounded to the decimals shown. `$`, `%` and
// thousands separators are ignored. Code decides; the model's text is never trusted.

/** Every number written in a text: "71.0%" -> 71.0, "$872,460" -> 872460, "14,019" -> 14019, "2026-10-30" -> 2026, 10, 30 (no signs: a hyphen joins date parts). */
export function figuresIn(text: string): { value: number; decimals: number; raw: string }[] {
  const out: { value: number; decimals: number; raw: string }[] = [];
  for (const m of text.matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g)) {
    const raw = m[0];
    const plain = raw.replace(/,/g, '');
    out.push({ value: Number(plain), decimals: plain.split('.')[1]?.length ?? 0, raw });
  }
  return out;
}

/** Every number anywhere in a JSON value (tool results and arguments), including numbers written inside strings. */
export function numbersIn(value: unknown, into: number[] = []): number[] {
  if (typeof value === 'number' && Number.isFinite(value)) into.push(value);
  else if (typeof value === 'string') for (const f of figuresIn(value)) into.push(f.value);
  else if (Array.isArray(value)) for (const v of value) numbersIn(v, into);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) numbersIn(v, into);
  return into;
}

const round = (n: number, d: number) => Number(n.toFixed(d));

/** True when `f` is one of `known`, as written, as a rate × 100, or rounded to the decimals `f` shows. */
export function found(f: { value: number; decimals: number }, known: number[]): boolean {
  return known.some((k) => [k, k * 100].some((c) => c === f.value || round(c, f.decimals) === f.value));
}

/** The figures in `answer` that no source holds; empty means the answer is checked. */
export function uncheckedFigures(answer: string, sources: unknown[]): string[] {
  const known = sources.flatMap((s) => numbersIn(s));
  return figuresIn(answer).filter((f) => !found(f, known)).map((f) => f.raw);
}
