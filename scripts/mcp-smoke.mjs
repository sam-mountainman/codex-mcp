import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const client = new Client({ name: "codex-mcp-smoke", version: "0.1.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [resolve(root, "dist/server.bundled.mjs")],
  cwd: root,
});

try {
  await client.connect(transport);
  const tools = await client.listTools();
  const names = tools.tools.map((tool) => tool.name).sort();
  const expected = ["gpt_ask", "gpt_continue", "gpt_plan", "gpt_review", "gpt_status"];
  if (JSON.stringify(names) !== JSON.stringify(expected)) throw new Error(`Unexpected tools: ${names.join(", ")}`);
  const status = await client.callTool({ name: "gpt_status", arguments: {} });
  const text = status.content?.find((part) => part.type === "text")?.text || "";
  if (!text.includes("# codex-mcp status") || !text.includes("gpt-5.6-sol")) throw new Error(`Unexpected status output: ${text}`);
  console.log(`MCP smoke passed: ${names.join(", ")}`);
} finally {
  await client.close();
}
