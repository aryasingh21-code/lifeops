import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { realTools } from "../tools/index.js";

/** Exposes the same Gmail / Calendar / browser tools to any MCP client (Claude Desktop, Cursor, ...). */
const server = new McpServer({ name: "lifeops", version: "0.1.0" });

for (const tool of realTools) {
  server.registerTool(
    tool.name,
    { description: tool.description, inputSchema: tool.schema.shape },
    async (args: unknown) => {
      try {
        const out = await tool.run(args);
        return { content: [{ type: "text" as const, text: JSON.stringify(out, null, 2) }] };
      } catch (e) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: e instanceof Error ? e.message : String(e) }],
        };
      }
    },
  );
}

await server.connect(new StdioServerTransport());
