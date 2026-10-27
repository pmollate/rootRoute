import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { allowList } from '../../core/config.js';
import { restore } from '../../core/pii/redact.js';
import { requireApiKey } from '../../core/auth.js';
import { applyAction } from './actions.js';
import { getDeps } from './deps.js';
import { fetchRecentEmails } from './mailbox.js';
import { processEmail } from './pipeline.js';

const EmailBody = z.object({
  from: z.string().min(3), subject: z.string(), body: z.string().min(1),
  receivedAt: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/), inReplyTo: z.number().int().optional(),
});
const ActionBody = z.object({ action: z.enum(['approve', 'send_reply', 'send_to_wms']), user: z.string().min(1) });
const FetchBody = z.object({ query: z.string().optional(), max: z.number().int().min(1).max(50).default(20) });

const routes: FastifyPluginAsync = async (app) => {
  app.get('/intake', async () => ({
    emails: (await getDeps().repo.listEmails()).map((e) => ({
      id: e.id, source: e.source, from: e.from_addr, subject: e.subject, receivedAt: e.received_at, clientId: e.client_id,
      status: e.status, decision: e.decision, inReplyTo: e.in_reply_to, priority: e.priority,
    })),
  }));

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

  /** "Fetch from Gmail": new order emails in the demo inbox, oldest first so a client's reply follows our question. */
  app.post('/intake/fetch', { preHandler: requireApiKey }, async (req, reply) => {
    const body = FetchBody.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: body.error.message });
    const deps = getDeps();
    if (!deps.gmail) return reply.code(503).send({ error: 'Gmail is not set up (GMAIL_* in .env)' });
    const emails = (await fetchRecentEmails(deps.gmail, body.data.query, body.data.max)).reverse();
    const results = [];
    for (const e of emails) {
      results.push(await processEmail({ from: e.from, subject: e.subject, body: e.body, receivedAt: e.receivedAt,
        source: 'gmail', gmailId: e.gmailId, threadId: e.threadId, messageId: e.messageId }, deps));
    }
    req.log.info({ fetched: emails.length }, 'intake fetched from Gmail');
    return { fetched: emails.length, results };
  });

  app.post<{ Params: { id: string } }>('/intake/:id/action', { preHandler: requireApiKey }, async (req, reply) => {
    const body = ActionBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.message });
    const deps = getDeps();
    const result = await applyAction(deps.repo, Number(req.params.id), body.data.action, body.data.user,
      { gmail: deps.gmail, allow: allowList });
    req.log.info({ emailId: Number(req.params.id), action: body.data.action, code: result.code }, 'intake action');
    return reply.code(result.code).send(result.error ? { error: result.error } : { status: result.status });
  });
};

export default routes;
