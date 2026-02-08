import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SocketClient } from "../socket-client.js";

export function registerCancelTask(server: McpServer, client: SocketClient) {
  server.tool(
    "cancel_task",
    "Cancel a running task on a remote node. The task will be aborted via AbortController and return a CANCELLED result.",
    {
      task_id: z.string().describe("The task ID to cancel"),
    },
    async ({ task_id }) => {
      try {
        await client.cancelTask(task_id);

        return {
          content: [
            {
              type: "text" as const,
              text: `Cancel request sent for task: ${task_id}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error cancelling task: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
