/** What grouping needs of an email: its id, the email it answers, and when it arrived. */
export interface Threadable { id: number; inReplyTo: number | null; receivedAt: string }

/** One order conversation: its first email's id, its emails oldest first, and the newest (the order's current state). */
export interface Thread<E extends Threadable> { id: number; emails: E[]; latest: E }

/**
 * Groups emails into order conversations by their reply links, keeping the given order (the inbox's: priority clients
 * first). A client's answer is stored as its own email that points at the one it answers, so one order can be several
 * emails; Order emails and the Order journey picker both list it once.
 */
export function toThreads<E extends Threadable>(emails: E[]): Thread<E>[] {
  const byId = new Map(emails.map((e) => [e.id, e]));
  const rootOf = (e: E) => {
    let r = e;
    for (let hops = 0; r.inReplyTo && byId.has(r.inReplyTo) && hops < 50; hops++) r = byId.get(r.inReplyTo)!;
    return r.id;
  };
  const groups = new Map<number, E[]>();
  for (const e of emails) { const id = rootOf(e); groups.set(id, [...(groups.get(id) ?? []), e]); }
  return [...groups].map(([id, list]) => {
    const sorted = [...list].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.id - b.id);
    return { id, emails: sorted, latest: sorted[sorted.length - 1] };
  });
}
