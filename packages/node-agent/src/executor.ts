import {
  createTaskError,
  ErrorCodes,
  TASK_RESULT_MAX_LENGTH,
  type TaskRequest,
  type TaskResult,
  type TaskProgress,
  type PromptPayload,
} from "@remote-subagent/shared";
import { ClaudeSession } from "./claude.js";
import type { AgentConfig } from "./config.js";

export class TaskExecutor {
  private claude: ClaudeSession;
  private config: AgentConfig;
  private onProgress: ((progress: TaskProgress) => void) | null = null;
  private currentAbortController: AbortController | null = null;

  constructor(config: AgentConfig) {
    this.config = config;
    this.claude = new ClaudeSession(config.claudeModel, config.claudePath);
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

      if (request.payload.type !== "prompt") {
        throw createTaskError(
          "EXECUTION_ERROR",
          `Unknown task type: ${request.type}`,
        );
      }

      result = await this.executePrompt(
        request.payload as PromptPayload,
        request.taskId,
        request.context,
      );

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
      const validCodes: Set<string> = new Set(Object.values(ErrorCodes));
      const isTaskError =
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        typeof (err as Record<string, unknown>).code === "string" &&
        validCodes.has((err as Record<string, unknown>).code as string);

      const taskError = isTaskError
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

}
