/**
 * SEC-LINK-01 (SPEC §5.17): a confirm route's URL is logged as /confirm/[token]; the one-time token never reaches a log
 * line. The same goes for MCP_TOKEN in /api/mcp/:token (REQ-MCP-02, claude.ai connectors). Used by the request log
 * serializer (server.ts) and the auth hook's route field for unmatched URLs (auth.ts).
 */
export const redactLink = (url: string): string =>
  url.replace(/\/confirm\/[^/?#]+/, '/confirm/[token]').replace(/\/mcp\/[^/?#]+/, '/mcp/[token]');
