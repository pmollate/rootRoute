// Email arrival times are stored as wall-clock "YYYY-MM-DD HH:mm" in the mailbox's zone (MAILBOX_TIMEZONE, sent by the
// API as `timeZone`). The dashboard shows them in the viewer's own zone, and turns a time the operator types back into
// the mailbox's zone before sending it. Without a zone (an older API) times are shown and sent as stored.

/** The browser's own IANA zone. */
export const viewerZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

const wallMs = (at: string) => {
  const [y, m, d, h, min] = at.split(/[-: T]/).map(Number);
  return Date.UTC(y, m - 1, d, h, min);
};

/** The wall clock in `timeZone` at instant `ms`, read as if it were UTC (ms). */
function wallAt(ms: number, timeZone: string): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
}

/** The instant of wall-clock `at` in `timeZone`, by that zone's daylight-saving rules (as the API's localToInstant). */
export function instantOf(at: string, timeZone: string): number {
  const wall = wallMs(at);
  const first = wall - (wallAt(wall, timeZone) - wall);
  const instant = wall - (wallAt(first, timeZone) - first);
  return instant + (wall - wallAt(instant, timeZone));
}

const format = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');

/** "YYYY-MM-DD HH:mm" in `from` as the same instant's wall clock in `to`. */
function convert(at: string, from: string | null | undefined, to: string): string {
  if (!from || !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(at) || from === to) return at;
  try { return format(wallAt(instantOf(at.slice(0, 16), from), to)); } catch { return at; }
}

/** A stored arrival time (mailbox zone) as the viewer's wall clock. */
export const toViewer = (at: string, mailZone: string | null | undefined, view = viewerZone()) => convert(at, mailZone, view);

/** A time the viewer typed (their wall clock) as the mailbox's wall clock, as the API stores it. */
export const toMailbox = (at: string, mailZone: string | null | undefined, view = viewerZone()) =>
  mailZone ? convert(at, view, mailZone) : at;
