import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SocketClient } from "../socket-client.js";

export function registerDeleteSession(server: McpServer, client: SocketClient) {
  server.tool(
    "delete_session",
    "Delete a conversation session from the master's tracking. This removes the session metadata so it can no longer be resumed via send_prompt. The Claude CLI's local session files on the target node are not affected.",
    {
      session_id: z
        .string()
        .uuid()
        .describe("The session ID to delete (use list_sessions to see active sessions)"),
    },
    async ({ session_id }) => {
      try {
        const result = await client.deleteSession(session_id);

        if (result.success) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Session ${session_id} deleted successfully.`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: "text" as const,
                text: `Session ${session_id} not found.`,
              },
            ],
            isError: true,
          };
        }
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
