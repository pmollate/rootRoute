import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { allowList, config } from '../../core/config.js';
import { restore } from '../../core/pii/redact.js';
import { requireApiKey } from '../../core/auth.js';
import { diagnosisApi } from '../warehouse/index.js';
import { applyAction } from './actions.js';
import { runAlerts } from './alerts.js';
import { listComplaints, saveTriage, triage } from './complaints.js';
import { getDeps } from './deps.js';
import { processEmail } from './pipeline.js';
import { POLL_MAX, runPoll } from './poll.js';

const EmailBody = z.object({
  from: z.string().min(3), subject: z.string(), body: z.string().min(1),
  receivedAt: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/), inReplyTo: z.number().int().optional(),
});
// `reply`: the operator's edited reply text (send_reply only); without it the stored draft is sent.
const ActionBody = z.object({ action: z.enum(['approve', 'send_reply', 'send_to_wms']), user: z.string().min(1),
  reply: z.string().trim().min(1).max(5000).optional() });
const FetchBody = z.object({ query: z.string().optional(), max: z.number().int().min(1).max(POLL_MAX).default(POLL_MAX) });

const routes: FastifyPluginAsync = async (app) => {
  app.get('/intake', async () => {
    const { repo, gmail } = getDeps();
    const last = await repo.lastPoll();
    return {
      emails: (await repo.listEmails()).map((e) => ({
        id: e.id, source: e.source, from: e.from_addr, subject: e.subject, receivedAt: e.received_at, clientId: e.client_id,
        status: e.status, decision: e.decision, inReplyTo: e.in_reply_to, priority: e.priority,
      })),
      // E15: how often the API checks Gmail by itself (0 = not at all), and how the last check went.
      pollMinutes: gmail ? config.INTAKE_POLL_MINUTES : 0,
      lastPoll: last && { trigger: last.trigger, startedAt: last.started_at, finishedAt: last.finished_at,
        processed: last.processed, retried: last.retried, failed: last.failed, ok: last.ok },
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
      replyDraft: x ? restore(x.reply_draft, email.pii_map ?? {}) : null, replySource: x?.reply_source ?? null,
    };
  });

  app.post('/intake/email', { preHandler: requireApiKey }, async (req, reply) => {
    const body = EmailBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.message });
    const result = await processEmail({ ...body.data, source: 'paste' }, getDeps());
    req.log.info({ emailId: result.id, decision: result.decision, status: result.status }, 'intake email decided');
    return result;
  });

  /** "Fetch from Gmail": the same check the timer runs every INTAKE_POLL_MINUTES (E15), started by hand. */
  app.post('/intake/fetch', { preHandler: requireApiKey }, async (req, reply) => {
    const body = FetchBody.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: body.error.message });
    const deps = getDeps();
    if (!deps.gmail) return reply.code(503).send({ error: 'Gmail is not set up (GMAIL_* in .env)' });
    const r = await runPoll(deps, 'button', body.data);
    if (!r) return reply.code(409).send({ error: 'Another Gmail check is running: try again in a minute' });
    req.log.info({ pollId: r.pollId, fetched: r.fetched, processed: r.processed, retried: r.retried, ok: r.ok },
      'intake fetched from Gmail');
    return r;
  });

  app.post<{ Params: { id: string } }>('/intake/:id/action', { preHandler: requireApiKey }, async (req, reply) => {
    const body = ActionBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.message });
    const deps = getDeps();
    const result = await applyAction(deps.repo, Number(req.params.id), body.data.action, body.data.user,
      { gmail: deps.gmail, allow: allowList }, body.data.reply);
    req.log.info({ emailId: Number(req.params.id), action: body.data.action, code: result.code }, 'intake action');
    return reply.code(result.code).send(result.error ? { error: result.error } : { status: result.status });
  });

  app.get('/complaints', async () => ({
    complaints: (await listComplaints()).map((c) => ({ complaintId: c.complaint_id, clientId: c.client_id, deliveryId: c.delivery_id,
      category: c.category, date: c.complaint_date, text: c.text, atRisk: c.at_risk, tier: c.account_tier })),
  }));

  app.post<{ Params: { id: string } }>('/complaints/:id/triage', async (req, reply) => {
    const row = (await listComplaints()).find((c) => c.complaint_id === req.params.id);
    if (!row) return reply.code(404).send({ error: 'not found' });
    const t = await triage(getDeps().llm, diagnosisApi, row);
    await saveTriage(t);
    return t;
  });

  app.post('/alerts/run', { preHandler: requireApiKey }, async (req, reply) => {
    const asOf = (req.body as { asOf?: string } | undefined)?.asOf;
    if (!asOf || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return reply.code(400).send({ error: 'asOf must be YYYY-MM-DD' });
    return { drafted: await runAlerts(asOf) };
  });
};

export default routes;
