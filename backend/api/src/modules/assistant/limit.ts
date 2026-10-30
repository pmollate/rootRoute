/** SEC-ASK-02: at most `max` questions per key in `windowMs`. In memory: one API instance (SPEC §10). */
export class QuestionLimiter {
  private seen = new Map<string, number[]>();
  constructor(private readonly max: number, private readonly windowMs = 60_000, private readonly now: () => number = Date.now) {}
  /** Counts the question and says whether it may run. A refused question is not counted. */
  take(key: string): boolean {
    const t = this.now();
    const recent = (this.seen.get(key) ?? []).filter((x) => t - x < this.windowMs);
    if (recent.length >= this.max) { this.seen.set(key, recent); return false; }
    recent.push(t);
    this.seen.set(key, recent);
    return true;
  }
}
