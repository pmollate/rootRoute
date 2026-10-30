import type { FastifyPluginAsync } from 'fastify';
import { allowList, config } from '../../core/config.js';
import { restore } from '../../core/pii/redact.js';
import { actorOf } from '../../core/auth.js';
import { autoAdvanceOrder, logOverride, recordOrderEvent } from '../carriers/index.js';
import { autoAdvanceOn } from '../settings/index.js';
import { diagnosisApi } from '../warehouse/index.js';
import { applyAction } from './actions.js';
import { runAlerts } from './alerts.js';
import { complaintQueue, deliveryStages, listComplaints, savedTriages, saveTriage, triage } from './complaints.js';
import { getDeps } from './deps.js';
import { processEmail } from './pipeline.js';
import { safeNames } from './reply.js';
import { ActionBody, EmailBody, FetchBody, limits, readable } from './input.js';
import { pollLogFields, runPoll } from './poll.js';
import { reviewQueue } from './review.js';
import { httpWms } from './wms.js';

/** The first lines of an email after the greeting, for the inbox row (as a mail client shows under the subject). */
export function preview(body: string): string {
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  const start = /^(hi|hello|hey|dear)\b/i.test(lines[0] ?? '') ? 1 : 0;
  return lines.slice(start).join(' ').slice(0, 140);
}

const routes: FastifyPluginAsync = async (app) => {
  const wms = httpWms(config.WMS_URL, config.WMS_TOKEN); // null without WMS_URL (design §5)
  app.get('/intake', async () => {
    const { repo, gmail } = getDeps();
    const last = await repo.lastPoll();
    return {
      emails: (await repo.listEmails()).map((e) => ({
        id: e.id, source: e.source, from: e.from_addr, subject: e.subject, receivedAt: e.received_at, clientId: e.client_id,
        status: e.status, decision: e.decision, inReplyTo: e.in_reply_to, priority: e.priority,
        // For the thread list: client facts from clients.csv, the parsed items and the first lines of the body.
        clientName: e.client_name, tier: e.account_tier, items: e.items,
        preview: preview(e.body),
      })),
      // E15: how often the API checks Gmail by itself (0 = not at all), and how the last check went.
      pollMinutes: gmail ? config.INTAKE_POLL_MINUTES : 0,
      lastPoll: last && { trigger: last.trigger, startedAt: last.started_at, finishedAt: last.finished_at,
        processed: last.processed, retried: last.retried, failed: last.failed, ok: last.ok },
      // REQ-INT-16: the paste form shows these limits before the API refuses a longer email.
      limits: limits(),
    };
  });

  app.get<{ Params: { id: string } }>('/intake/:id', async (req, reply) => {
    const { repo } = getDeps();
    const id = Number(req.params.id);
    const email = await repo.getEmail(id);
    if (!email) return reply.code(404).send({ error: 'not found' });
    const x = await repo.latestExtraction(id);
    return {
      email: { id: email.id, source: email.source, from: email.from_addr, subject: email.subject, body: email.body,
        redactedBody: email.redacted_body, receivedAt: email.received_at, clientId: email.client_id, status: email.status,
        inReplyTo: email.in_reply_to },
      extraction: x?.extraction ?? null, decision: x?.decision ?? null, checks: x?.checks ?? null,
      // The operator approves exactly what will be sent: names put back, as in the outgoing email.
      replyDraft: x ? restore(x.reply_draft, safeNames(email.pii_map)) : null, replySource: x?.reply_source ?? null,
      replySent: await repo.replySent(id),
    };
  });

  /** E18 / REQ-INT-14: ALL_CLEAR orders awaiting approval, priority clients first, with the unblocked carriers of each lane. */
  app.get('/intake/review', async () => ({ orders: await reviewQueue(getDeps().repo) }));

  // Roles for every route: core/permissions.ts, checked in server.ts before the handler runs (SPEC-auth §4.2).
  app.post('/intake/email', async (req, reply) => {
    const body = EmailBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send(readable(body.error));
    const deps = getDeps();
    const result = await processEmail({ ...body.data, source: 'paste' }, deps);
    const who = actorOf(req);
    await deps.repo.logAudit(who.id, 'paste_email', `email:${result.id}`, { name: who.name, roles: who.roles });
    req.log.info({ emailId: result.id, decision: result.decision, status: result.status, reason: result.reason ?? null }, 'intake email decided');
    return result;
  });

  /** "Fetch from Gmail": the same check the timer runs every INTAKE_POLL_MINUTES (E15), started by hand. */
  app.post('/intake/fetch', async (req, reply) => {
    const body = FetchBody.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send(readable(body.error));
    const deps = getDeps();
    if (!deps.gmail) return reply.code(503).send({ error: 'Gmail is not set up (GMAIL_* in .env)' });
    const r = await runPoll(deps, 'button', { ...body.data, actor: actorOf(req).id });
    if (!r) return reply.code(409).send({ error: 'Another Gmail check is running: try again in a minute' });
    req.log.info(pollLogFields(r), 'intake fetched from Gmail');
    return r;
  });

  app.post<{ Params: { id: string } }>('/intake/:id/action', async (req, reply) => {
    const body = ActionBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send(readable(body.error));
    const deps = getDeps();
    const result = await applyAction(deps.repo, Number(req.params.id), body.data.action, actorOf(req),
      { gmail: deps.gmail, allow: allowList },
      { edited: body.data.reply, reason: body.data.reason, carrier: body.data.carrier, overrides: logOverride,
        wms, orderEvents: recordOrderEvent, autoAdvance: { on: autoAdvanceOn, run: autoAdvanceOrder } });
    req.log.info({ emailId: Number(req.params.id), action: body.data.action, carrier: body.data.carrier ?? null, code: result.code,
      error: result.error ?? null, cause: result.cause ?? null, warning: result.warning ?? null }, 'intake action');
    return reply.code(result.code).send(result.error ? { error: result.error }
      : { status: result.status, ...(result.warning ? { warning: result.warning } : {}) });
  });

  // E12 + E14: escalations (Tier 1 or at-risk clients) first, each with its delivery's cause stages and latest saved triage.
  app.get('/complaints', async () => {
    const rows = await listComplaints();
    return { complaints: complaintQueue(rows, await savedTriages(), await deliveryStages(rows.map((r) => r.delivery_id))) };
  });

  app.post<{ Params: { id: string } }>('/complaints/:id/triage', async (req, reply) => {
    const row = (await listComplaints()).find((c) => c.complaint_id === req.params.id);
    if (!row) return reply.code(404).send({ error: 'not found' });
    const deps = getDeps();
    const t = await triage(deps.llm, diagnosisApi, row);
    await saveTriage(t);
    const who = actorOf(req);
    await deps.repo.logAudit(who.id, 'triage', `complaint:${row.complaint_id}`, { name: who.name, roles: who.roles, escalate: t.escalate });
    req.log.info({ complaintId: row.complaint_id, deliveryId: t.deliveryId, escalate: t.escalate, source: t.source }, 'complaint triaged');
    return t;
  });

  app.post('/alerts/run', async (req, reply) => {
    const asOf = (req.body as { asOf?: string } | undefined)?.asOf;
    if (!asOf || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return reply.code(400).send({ error: 'asOf must be YYYY-MM-DD' });
    const drafted = await runAlerts(asOf);
    const who = actorOf(req);
    await getDeps().repo.logAudit(who.id, 'alerts_run', `alerts:${asOf}`, { name: who.name, roles: who.roles, drafted });
    return { drafted };
  });
};

export default routes;
