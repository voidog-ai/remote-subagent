import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SocketClient } from "../socket-client.js";

export function registerWriteRemoteFile(
  server: McpServer,
  client: SocketClient,
) {
  server.tool(
    "write_remote_file",
    "Write content to a file on a remote node. The file path must be an absolute path on the target machine. Parent directories will be created if they don't exist. Subject to the node's allowed paths restriction.",
    {
      target: z.string().describe("Target node ID"),
      file_path: z
        .string()
        .describe("Absolute file path on the target machine"),
      content: z.string().describe("Content to write to the file"),
    },
    async ({ target, file_path, content }) => {
      try {
        const result = await client.sendTask(target, "file_write", {
          type: "file_write",
          filePath: file_path,
          content,
        });

        if (result.success) {
          return {
            content: [
              {
                type: "text" as const,
                text: `[${target}] ${result.result}`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: "text" as const,
                text: `[${target}] Error writing file: ${result.error?.code}: ${result.error?.message}`,
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
