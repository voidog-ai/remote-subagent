import { exec } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  createTaskError,
  TASK_RESULT_MAX_LENGTH,
  type TaskRequest,
  type TaskResult,
  type TaskProgress,
  type PromptPayload,
  type ShellPayload,
  type FileReadPayload,
  type FileWritePayload,
} from "@remote-subagent/shared";
import { SecurityValidator } from "./security.js";
import { ClaudeSession } from "./claude.js";
import type { AgentConfig } from "./config.js";

export class TaskExecutor {
  private security: SecurityValidator;
  private claude: ClaudeSession;
  private config: AgentConfig;
  private onProgress: ((progress: TaskProgress) => void) | null = null;
  private currentAbortController: AbortController | null = null;

  constructor(config: AgentConfig) {
    this.config = config;
    this.security = new SecurityValidator(
      config.allowedPaths,
      config.deniedCommands,
    );
    this.claude = new ClaudeSession(config.claudeModel);
  }

  setOnProgress(callback: (progress: TaskProgress) => void): void {
    this.onProgress = callback;
  }

  cancelCurrentTask(): void {
    this.claude.cancelCurrentTask();
    this.currentAbortController?.abort();
  }

  async execute(request: TaskRequest): Promise<TaskResult> {
    const startedAt = Date.now();

    try {
      let result: string;

      switch (request.payload.type) {
        case "prompt":
          result = await this.executePrompt(
            request.payload as PromptPayload,
            request.taskId,
            request.context,
          );
          break;
        case "shell":
          result = await this.executeShell(
            request.payload as ShellPayload,
          );
          break;
        case "file_read":
          result = await this.executeFileRead(
            request.payload as FileReadPayload,
          );
          break;
        case "file_write":
          result = await this.executeFileWrite(
            request.payload as FileWritePayload,
          );
          break;
        default:
          throw createTaskError(
            "EXECUTION_ERROR",
            `Unknown task type: ${request.type}`,
          );
      }

      // Truncate result if too large
      if (result.length > TASK_RESULT_MAX_LENGTH) {
        result =
          result.substring(0, TASK_RESULT_MAX_LENGTH) +
          `\n...[truncated, ${result.length} total chars]`;
      }

      return {
        taskId: request.taskId,
        sourceNodeId: request.sourceNodeId,
        targetNodeId: request.targetNodeId,
        success: true,
        result,
        durationMs: Date.now() - startedAt,
        completedAt: new Date().toISOString(),
      };
    } catch (err: unknown) {
      const taskError =
        typeof err === "object" && err !== null && "code" in err
          ? (err as import("@remote-subagent/shared").TaskError)
          : createTaskError(
              "EXECUTION_ERROR",
              err instanceof Error ? err.message : String(err),
            );

      return {
        taskId: request.taskId,
        sourceNodeId: request.sourceNodeId,
        targetNodeId: request.targetNodeId,
        success: false,
        error: taskError,
        durationMs: Date.now() - startedAt,
        completedAt: new Date().toISOString(),
      };
    }
  }

  private async executePrompt(
    payload: PromptPayload,
    taskId: string,
    context?: string,
  ): Promise<string> {
    return this.claude.executeTask(
      payload,
      taskId,
      context,
      this.onProgress
        ? (progress) =>
            this.onProgress!({
              ...progress,
              nodeId: this.config.nodeId,
            })
        : undefined,
    );
  }

  private async executeShell(payload: ShellPayload): Promise<string> {
    this.security.validateCommand(payload.command);

    const timeoutMs = payload.timeoutMs || 60_000;
    const cwd = payload.cwd || process.cwd();

    return new Promise<string>((resolve, reject) => {
      const child = exec(
        payload.command,
        {
          cwd,
          timeout: timeoutMs,
          shell: this.config.defaultShell,
          maxBuffer: 10 * 1024 * 1024, // 10MB
        },
        (error, stdout, stderr) => {
          if (error) {
            if (error.killed) {
              reject(
                createTaskError(
                  "TIMEOUT",
                  `Shell command timed out after ${timeoutMs}ms`,
                ),
              );
            } else {
              // Include both stdout and stderr in error case
              const output = [stdout, stderr].filter(Boolean).join("\n");
              reject(
                createTaskError(
                  "EXECUTION_ERROR",
                  `Command failed (exit ${error.code}): ${error.message}`,
                  output || undefined,
                ),
              );
            }
            return;
          }

          const output = [stdout, stderr].filter(Boolean).join("\n");
          resolve(output.trim());
        },
      );
    });
  }

  private async executeFileRead(payload: FileReadPayload): Promise<string> {
    const filePath = path.resolve(path.normalize(payload.filePath));
    this.security.validateFilePath(filePath);

    const content = await readFile(filePath, "utf-8");
    return content;
  }

  private async executeFileWrite(payload: FileWritePayload): Promise<string> {
    const filePath = path.resolve(path.normalize(payload.filePath));
    this.security.validateFilePath(filePath);

    // Ensure parent directory exists
    const dir = path.dirname(filePath);
    await mkdir(dir, { recursive: true });

    await writeFile(filePath, payload.content, "utf-8");
    return `File written: ${filePath} (${payload.content.length} bytes)`;
  }
}
