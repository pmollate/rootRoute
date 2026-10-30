import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { config } from '../../core/config.js';
import { buildMcpServer, mcpAuth } from './server.js';

/** POST /api/mcp: Streamable HTTP, stateless (a new server per request), JSON responses. */
const routes: FastifyPluginAsync = async (app) => {
  app.post('/mcp', async (req, reply) => {
    const code = mcpAuth(req.headers, config.MCP_TOKEN);
    if (code !== 200) return reply.code(code).send({ error: code === 503 ? 'MCP is not set up (MCP_TOKEN)' : 'unauthorized' });
    const body = req.body as { method?: string; params?: { name?: string } } | undefined;
    req.log.info({ method: body?.method, tool: body?.params?.name }, 'mcp request');
    const server = buildMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    reply.hijack();
    reply.raw.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req.raw, reply.raw, req.body);
  });

  // Stateless, so no SSE stream to open (GET) and no session to end (DELETE): the MCP spec's answer is 405.
  // A 401 here would make a client think the server wants OAuth.
  const notAllowed = async (_req: unknown, reply: FastifyReply) => reply.code(405).header('allow', 'POST')
    .send({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });
  app.get('/mcp', notAllowed);
  app.delete('/mcp', notAllowed);
};

export default routes;
