import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SocketClient } from "../socket-client.js";

export function registerBroadcastPrompt(
  server: McpServer,
  client: SocketClient,
) {
  server.tool(
    "broadcast_prompt",
    "Send the same prompt to ALL connected agent nodes simultaneously. Uses Promise.allSettled with a configurable timeout (ADR-14). Returns results from all nodes that responded, plus TIMEOUT errors for nodes that didn't respond in time.",
    {
      prompt: z
        .string()
        .describe("The prompt to send to all connected agent nodes"),
      context: z
        .string()
        .optional()
        .describe("Additional context to share with all remote Claude instances"),
      cwd: z
        .string()
        .optional()
        .describe("Working directory on target machines (absolute path)"),
      timeout_ms: z
        .number()
        .optional()
        .describe(
          "Overall timeout in milliseconds (default: 300000 = 5 minutes)",
        ),
    },
    async ({ prompt, context, cwd, timeout_ms }) => {
      try {
        const nodes = await client.listNodes();
        const onlineNodes = nodes.filter((n) => n.status !== "offline");

        if (onlineNodes.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No online agent nodes to broadcast to.",
              },
            ],
          };
        }

        const timeout = timeout_ms || 300_000;

        // Send to all nodes in parallel (ADR-14)
        const promises = onlineNodes.map(async (node) => {
          const result = await client.sendTask(
            node.nodeId,
            "prompt",
            {
              type: "prompt",
              prompt,
              ...(cwd && { cwd }),
            },
            timeout,
            context,
          );
          return { nodeId: node.nodeId, nodeName: node.nodeName, result };
        });

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Broadcast timeout")),
            timeout + 5_000,
          ),
        );

        const results = await Promise.allSettled(
          promises.map((p) => Promise.race([p, timeoutPromise])),
        );

        const output = results
          .map((r, i) => {
            const node = onlineNodes[i];
            if (r.status === "fulfilled") {
              const { result } = r.value as {
                nodeId: string;
                nodeName: string;
                result: { success: boolean; result?: string; error?: any; durationMs: number };
              };
              if (result.success) {
                return `=== ${node.nodeName} (${node.nodeId}) - Success (${result.durationMs}ms) ===\n${result.result}\n`;
              } else {
                return `=== ${node.nodeName} (${node.nodeId}) - Error ===\n${result.error?.code}: ${result.error?.message}\n`;
              }
            } else {
              return `=== ${node.nodeName} (${node.nodeId}) - TIMEOUT ===\nNode did not respond within timeout\n`;
            }
          })
          .join("\n");

        return {
          content: [
            {
              type: "text" as const,
              text: `Broadcast results (${onlineNodes.length} nodes):\n\n${output}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
