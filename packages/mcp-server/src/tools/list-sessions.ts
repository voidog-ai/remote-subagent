import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SocketClient } from "../socket-client.js";

export function registerListSessions(server: McpServer, client: SocketClient) {
  server.tool(
    "list_sessions",
    "List active conversation sessions. Sessions track conversation history with remote Claude Code instances, enabling multi-turn conversations via send_prompt's session_id parameter.",
    {
      node_id: z
        .string()
        .optional()
        .describe("Filter sessions by target node ID. If omitted, returns all sessions."),
    },
    async ({ node_id }) => {
      try {
        const sessions = await client.listSessions(node_id);

        if (sessions.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No active sessions.",
              },
            ],
          };
        }

        const lines = sessions.map((s) => {
          const age = Date.now() - new Date(s.lastUsedAt).getTime();
          const ageMin = Math.floor(age / 60_000);
          const ageStr = ageMin < 60 ? `${ageMin}m ago` : `${Math.floor(ageMin / 60)}h ${ageMin % 60}m ago`;
          return `- ${s.sessionId}\n  Node: ${s.targetNodeId} | Messages: ${s.messageCount} | Last used: ${ageStr}`;
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Active sessions (${sessions.length}):\n\n${lines.join("\n\n")}`,
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
