import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SocketClient } from "../socket-client.js";

export function registerSendPrompt(server: McpServer, client: SocketClient) {
  server.tool(
    "send_prompt",
    "Send a prompt to a remote Claude Code instance on a specific node. The remote Claude will execute the prompt and return the result. Use the 'context' parameter to share relevant context from your current conversation.",
    {
      target: z.string().describe("Target node ID (use list_nodes to see available nodes)"),
      prompt: z.string().describe("The prompt to send to the remote Claude Code instance"),
      context: z
        .string()
        .optional()
        .describe(
          "Additional context from your current conversation to share with the remote Claude. This helps the remote Claude understand the broader task.",
        ),
      cwd: z
        .string()
        .optional()
        .describe(
          "Working directory on the target machine (absolute path on that machine)",
        ),
      model: z.string().optional().describe("Claude model to use on the remote node"),
    },
    async ({ target, prompt, context, cwd, model }) => {
      try {
        const result = await client.sendTask(
          target,
          "prompt",
          {
            type: "prompt",
            prompt,
            ...(cwd && { cwd }),
            ...(model && { model }),
          },
          300_000,
          context,
        );

        if (result.success) {
          return {
            content: [
              {
                type: "text" as const,
                text: `[Result from ${target}] (${result.durationMs}ms)\n\n${result.result}`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: "text" as const,
                text: `[Error from ${target}] ${result.error?.code}: ${result.error?.message}`,
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
