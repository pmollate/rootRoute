import { SYSTEM_INTAKE } from '../../core/auth.js';
import { config } from '../../core/config.js';
import { getDeps } from './deps.js';
import { fetchRecentEmails } from './mailbox.js';
import { type Deps, type IncomingEmail, type Processed, processEmail } from './pipeline.js';
import type { EmailRow, PollRow } from './repo.js';

/** A late or slow check is covered by the next one: each asks Gmail for 2 minutes before the last successful start. */
export const OVERLAP_SECONDS = 120;
/** The first check, before any has succeeded, looks back as far as the "Fetch from Gmail" button always did. */
export const FIRST_LOOKBACK_DAYS = 14;
export const POLL_MAX = 100;
/** Gives the API time to start before the first check. */
export const FIRST_POLL_DELAY_MS = 30_000;

/**
 * E15 / REQ-INT-08: inbox mail not sent by us that arrived after the last successful check, less the overlap.
 * Gmail's newer_than counts only whole days, so the window is an `after:` in seconds since the epoch.
 */
export function pollQuery(lastStart: number | null, nowSeconds: number): string {
  const after = lastStart === null ? nowSeconds - FIRST_LOOKBACK_DAYS * 86_400 : lastStart - OVERLAP_SECONDS;
  return `in:inbox -from:me after:${after}`;
}

export interface PollOutcome {
  pollId: number;
  query: string;
  fetched: number;   // messages Gmail returned
  processed: number; // new emails stored and decided
  retried: number;   // waiting emails run again
  failed: number;
  ok: boolean;
  error: string | null;
  results: Processed[];
}

/** NFR-03: the fields of a poll's log line, with the id of every email it stored or retried, so one email is traceable. */
export function pollLogFields(r: PollOutcome) {
  return { pollId: r.pollId, fetched: r.fetched, processed: r.processed, retried: r.retried, failed: r.failed, ok: r.ok,
    error: r.error, emailIds: r.results.map((x) => x.id) };
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 300);

/** A stored email as the pipeline takes it, to run again an email that waited for the AI services. */
function stored(e: EmailRow): IncomingEmail {
  return { from: e.from_addr, subject: e.subject, body: e.body, receivedAt: e.received_at, source: e.source,
    gmailId: e.gmail_id ?? undefined, threadId: e.thread_id ?? undefined, messageId: e.message_id,
    inReplyTo: e.in_reply_to ?? undefined };
}

/**
 * One Gmail check (REQ-INT-08), from the timer or the button: runs waiting emails again, then every new message in
 * the window, oldest first so a client's answer follows our question. A message already stored is skipped (dedupe by
 * Gmail id). The check is recorded in intake_polls; a failed one keeps the window open, so nothing is missed.
 * Returns null when another check holds the lock. The timer runs as system:intake with no role (SEC-AUTH-10); the
 * button passes the signed-in user. Either way the check only stores and decides: it never approves or enters an order.
 */
export async function runPoll(deps: Deps, trigger: PollRow['trigger'],
  opts: { query?: string; max?: number; nowMs?: number; actor?: string } = {}): Promise<PollOutcome | null> {
  const { repo, gmail } = deps;
  if (!gmail) throw new Error('Gmail is not set up (GMAIL_* settings)');
  return repo.withPollLock(async () => {
    const query = opts.query ?? pollQuery(await repo.lastPollStart(), Math.floor((opts.nowMs ?? Date.now()) / 1000));
    const pollId = await repo.startPoll(trigger, query);
    await repo.logAudit(opts.actor ?? SYSTEM_INTAKE, 'gmail_check', `poll:${pollId}`, { trigger });
    const out = { fetched: 0, processed: 0, retried: 0, failed: 0 };
    const errors: string[] = [];
    const results: Processed[] = [];

    for (const e of await repo.waitingEmails()) {
      try {
        results.push(await processEmail(stored(e), deps));
        out.retried += 1;
      } catch (err) {
        out.failed += 1;
        errors.push(`email ${e.id}: ${message(err)}`);
      }
    }

    try {
      const emails = (await fetchRecentEmails(gmail, query, opts.max ?? POLL_MAX)).reverse();
      out.fetched = emails.length;
      for (const e of emails) {
        if (await repo.findByGmailId(e.gmailId)) continue;
        try {
          results.push(await processEmail({ from: e.from, subject: e.subject, body: e.body, receivedAt: e.receivedAt,
            source: 'gmail', gmailId: e.gmailId, threadId: e.threadId, messageId: e.messageId }, deps));
          out.processed += 1;
        } catch (err) {
          out.failed += 1;
          errors.push(`gmail ${e.gmailId}: ${message(err)}`);
        }
      }
    } catch (err) {
      errors.push(`Gmail: ${message(err)}`);
    }

    const ok = errors.length === 0;
    const error = ok ? null : errors.join('; ').slice(0, 1000);
    await repo.finishPoll(pollId, { ...out, ok, error });
    return { pollId, query, ...out, ok, error, results };
  });
}

/** Calls tick now-ish and then every `minutes`, never two at once. Returns a stop function, or null when off. */
export function startPolling(minutes: number, tick: () => Promise<void>, firstDelayMs = FIRST_POLL_DELAY_MS): (() => void) | null {
  if (minutes <= 0) return null;
  let running = false;
  const once = async () => {
    if (running) return;
    running = true;
    try {
      await tick();
    } finally {
      running = false;
    }
  };
  const first = setTimeout(once, firstDelayMs);
  const timer = setInterval(once, minutes * 60_000);
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}

interface Log {
  info(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
}

/** E15: the API's own timer, started with the server. Off when INTAKE_POLL_MINUTES=0 or Gmail is not set up. */
export function startIntakePolling(log: Log, minutes = config.INTAKE_POLL_MINUTES): (() => void) | null {
  if (minutes <= 0) {
    log.info({ minutes }, 'gmail poll off (INTAKE_POLL_MINUTES=0)');
    return null;
  }
  let deps: Deps;
  try {
    deps = getDeps();
  } catch (err) {
    log.error({ err: message(err) }, 'gmail poll not started: intake services are not configured');
    return null;
  }
  if (!deps.gmail) {
    log.info({ minutes }, 'gmail poll off: Gmail is not set up (GMAIL_* settings)');
    return null;
  }
  log.info({ minutes }, 'gmail poll on');
  return startPolling(minutes, async () => {
    try {
      const r = await runPoll(getDeps(), 'schedule');
      if (!r) log.info({}, 'gmail poll skipped: another check is running');
      else log.info(pollLogFields(r), 'gmail poll done');
    } catch (err) {
      log.error({ err: message(err) }, 'gmail poll failed');
    }
  });
}
