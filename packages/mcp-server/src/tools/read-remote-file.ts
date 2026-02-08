import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SocketClient } from "../socket-client.js";

export function registerReadRemoteFile(
  server: McpServer,
  client: SocketClient,
) {
  server.tool(
    "read_remote_file",
    "Read a file from a remote node. The file path must be an absolute path on the target machine. Subject to the node's allowed paths restriction.",
    {
      target: z.string().describe("Target node ID"),
      file_path: z
        .string()
        .describe("Absolute file path on the target machine"),
    },
    async ({ target, file_path }) => {
      try {
        const result = await client.sendTask(target, "file_read", {
          type: "file_read",
          filePath: file_path,
        });

        if (result.success) {
          return {
            content: [
              {
                type: "text" as const,
                text: `[${target}] File: ${file_path}\n\n${result.result}`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: "text" as const,
                text: `[${target}] Error reading file: ${result.error?.code}: ${result.error?.message}`,
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
