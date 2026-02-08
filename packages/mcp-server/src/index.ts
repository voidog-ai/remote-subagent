import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SocketClient } from "./socket-client.js";
import { registerListNodes } from "./tools/list-nodes.js";
import { registerSendPrompt } from "./tools/send-prompt.js";
import { registerBroadcastPrompt } from "./tools/broadcast-prompt.js";
import { registerCancelTask } from "./tools/cancel-task.js";

const nodeId = process.env.MCP_NODE_ID || "mcp-client";
const masterUrl = process.env.MCP_MASTER_URL || "http://localhost:3100";
const token = process.env.MCP_TOKEN || "";

if (!token) {
  console.error(
    "MCP_TOKEN is required. Generate one with: npm run generate-token <nodeId>",
  );
  process.exit(1);
}

// Create MCP Server
const mcpServer = new McpServer({
  name: "remote-subagent",
  version: "1.0.0",
});

// Create Socket.IO client
const socketClient = new SocketClient(masterUrl, nodeId, token);

// Register all tools
registerListNodes(mcpServer, socketClient);
registerSendPrompt(mcpServer, socketClient);
registerBroadcastPrompt(mcpServer, socketClient);
registerCancelTask(mcpServer, socketClient);

// Start MCP server with stdio transport
const transport = new StdioServerTransport();
await mcpServer.connect(transport);

console.error(`[mcp] MCP Server started (node: ${nodeId})`);
console.error(`[mcp] Master URL: ${masterUrl}`);

// Graceful shutdown
const shutdown = () => {
  console.error("[mcp] Shutting down...");
  socketClient.disconnect();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
