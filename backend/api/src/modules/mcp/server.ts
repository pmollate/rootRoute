// D7 "Ask LateLens" (owner C, SPEC §5.14): read-only LateLens tools over MCP, so leadership can ask from an MCP client.
// The tools return the same figures as the dashboard (REQ-MCP-03); none sends email, approves or writes (REQ-MCP-01).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { bearerAuth } from '../../core/bearer.js';
import { TOOLS } from './tools.js';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const json = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data) }] });

/** Registers every tool of the shared registry (REQ-ASK-02); the SDK validates arguments against each zod shape. */
export function buildMcpServer(): McpServer {
  const server = new McpServer({ name: 'ask-latelens', version: '1.0.0' }, {
    instructions: 'Halcyon delivery diagnostics from the supplied dataset (48,340 deliveries, Apr–Sep 2026). '
      + 'Quote only figures returned by these tools; rates are fractions (0.71 = 71%).',
  });
  for (const t of TOOLS) {
    const shape = Object.keys(t.input).length ? { inputSchema: t.input } : {};
    server.registerTool(t.name, { title: t.title, description: t.description, ...shape, annotations: READ_ONLY },
      (async (args: Record<string, unknown>) => json(await t.run(args ?? {}))) as never);
  }
  return server;
}

/**
 * REQ-MCP-02: `Authorization: Bearer <MCP_TOKEN>`, or the same token in `x-api-key` for clients that keep Authorization
 * for their own OAuth (claude.ai custom connectors). No token configured means the endpoint is off, never open.
 */
export function mcpAuth(headers: { authorization?: string; 'x-api-key'?: string | string[] }, token: string | undefined) {
  const bearer = bearerAuth(headers.authorization, token);
  const key = headers['x-api-key'];
  return bearer === 401 && typeof key === 'string' ? bearerAuth(`Bearer ${key}`, token) : bearer;
}
