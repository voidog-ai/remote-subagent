import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SocketClient } from "../socket-client.js";

export function registerListNodes(server: McpServer, client: SocketClient) {
  server.tool(
    "list_nodes",
    "List all connected agent nodes with their status, capabilities, and metrics. MCP connections are excluded - only agent nodes that can execute tasks are shown.",
    {},
    async () => {
      try {
        const nodes = await client.listNodes();

        if (nodes.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No agent nodes currently connected.",
              },
            ],
          };
        }

        const nodeList = nodes
          .map((n) => {
            const metrics = n.metrics
              ? `CPU: ${n.metrics.cpuPercent}%, RAM: ${n.metrics.memoryUsedMB}/${n.metrics.memoryTotalMB}MB`
              : "No metrics";
            return [
              `- ${n.nodeName} (${n.nodeId})`,
              `  Status: ${n.status} | Platform: ${n.platform}/${n.arch}`,
              `  Capabilities: ${n.capabilities.join(", ")}`,
              `  Queue: ${n.queueLength} pending | Current task: ${n.currentTaskId || "none"}`,
              `  Metrics: ${metrics}`,
              `  Connected: ${n.connectedAt} | Last heartbeat: ${n.lastHeartbeat}`,
            ].join("\n");
          })
          .join("\n\n");

        return {
          content: [
            {
              type: "text" as const,
              text: `Connected nodes (${nodes.length}):\n\n${nodeList}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error listing nodes: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
