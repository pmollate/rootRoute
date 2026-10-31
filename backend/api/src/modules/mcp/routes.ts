import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../../core/config.js';
import { buildMcpServer, mcpAuth } from './server.js';

/** POST /api/mcp (token in a header) and /api/mcp/:token (token in the URL): Streamable HTTP, stateless, JSON responses. */
const routes: FastifyPluginAsync = async (app) => {
  const handle = async (req: FastifyRequest<{ Params: { token?: string } }>, reply: FastifyReply) => {
    const code = mcpAuth(req.headers, config.MCP_TOKEN, req.params.token);
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
  };
  app.post('/mcp', handle);
  app.post('/mcp/:token', handle);

  // Stateless, so no SSE stream to open (GET) and no session to end (DELETE): the MCP spec's answer is 405.
  // A 401 here would make a client think the server wants OAuth.
  const notAllowed = async (_req: unknown, reply: FastifyReply) => reply.code(405).header('allow', 'POST')
    .send({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });
  for (const url of ['/mcp', '/mcp/:token']) {
    app.get(url, notAllowed);
    app.delete(url, notAllowed);
  }
};

export default routes;
