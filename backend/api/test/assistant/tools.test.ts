import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { buildMcpServer } from '../../src/modules/mcp/server.js';
import { TOOLS, toolParameters } from '../../src/modules/mcp/tools.js';

async function mcpTools() {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1' });
  await Promise.all([buildMcpServer().connect(a), client.connect(b)]);
  return (await client.listTools()).tools;
}

describe('one tool registry for MCP and the assistant (D10, REQ-ASK-02)', () => {
  it('AC-ASK-02: MCP lists the registry: same six names, descriptions and input schemas', async () => {
    const listed = await mcpTools();
    expect(listed.map((t) => t.name)).toEqual(TOOLS.map((t) => t.name));
    for (const t of TOOLS) {
      const m = listed.find((x) => x.name === t.name)!;
      expect(m.description).toBe(t.description);
      const want = toolParameters(t) as { properties?: object; required?: string[] };
      expect(Object.keys(m.inputSchema.properties ?? {})).toEqual(Object.keys(want.properties ?? {}));
      expect(m.inputSchema.required ?? []).toEqual(want.required ?? []);
    }
  });

  it('AC-ASK-07: every tool in the registry is read-only', () => {
    expect(TOOLS).toHaveLength(6);
    for (const t of TOOLS) expect(t.readOnly).toBe(true);
  });
});
