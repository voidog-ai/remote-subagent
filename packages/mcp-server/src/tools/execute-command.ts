import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SocketClient } from "../socket-client.js";

export function registerExecuteCommand(
  server: McpServer,
  client: SocketClient,
) {
  server.tool(
    "execute_command",
    "Execute a shell command on a remote node. The command runs in the node's configured shell (bash/zsh on Unix, cmd.exe/powershell on Windows). Commands are subject to the node's security restrictions (denied commands list).",
    {
      target: z.string().describe("Target node ID"),
      command: z.string().describe("Shell command to execute"),
      cwd: z
        .string()
        .optional()
        .describe("Working directory (absolute path on target machine)"),
      timeout_ms: z
        .number()
        .optional()
        .describe("Command timeout in milliseconds (default: 60000)"),
    },
    async ({ target, command, cwd, timeout_ms }) => {
      try {
        const result = await client.sendTask(
          target,
          "shell",
          {
            type: "shell",
            command,
            ...(cwd && { cwd }),
            ...(timeout_ms && { timeoutMs: timeout_ms }),
          },
          timeout_ms ? timeout_ms + 10_000 : 70_000,
        );

        if (result.success) {
          return {
            content: [
              {
                type: "text" as const,
                text: `[${target}] Command completed (${result.durationMs}ms)\n\n${result.result}`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: "text" as const,
                text: `[${target}] Command failed: ${result.error?.code}: ${result.error?.message}${result.error?.details ? `\n\nOutput:\n${result.error.details}` : ""}`,
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
