import { spawn, type ChildProcess } from "node:child_process";
import type { PromptPayload, TaskProgress } from "@remote-subagent/shared";

interface TaskExecution {
  resolve: (result: string) => void;
  reject: (error: Error) => void;
  abortController: AbortController;
  taskId: string;
}

export class ClaudeSession {
  private process: ChildProcess | null = null;
  private currentExecution: TaskExecution | null = null;
  private sessionId: string | undefined;
  private model: string;
  private claudePath: string;
  private outputBuffer = "";

  constructor(model: string, claudePath = "claude") {
    this.model = model;
    this.claudePath = claudePath;
  }

  async executeTask(
    task: PromptPayload,
    taskId: string,
    context?: string,
    onProgress?: (progress: Omit<TaskProgress, "nodeId">) => void,
  ): Promise<string> {
    const abortController = new AbortController();

    // Build prompt with context
    let fullPrompt = "";
    if (context) {
      fullPrompt += `[Context from requesting agent]: ${context}\n\n`;
    }
    fullPrompt += task.prompt;

    return new Promise<string>((resolve, reject) => {
      this.currentExecution = {
        resolve,
        reject,
        abortController,
        taskId,
      };

      // Build claude command args
      const args = [
        "--print",
        "--output-format",
        "text",
        "--model",
        task.model || this.model,
      ];

      if (task.maxTurns) {
        args.push("--max-turns", String(task.maxTurns));
      }

      args.push("--prompt", fullPrompt);

      const cwd = task.cwd || process.cwd();

      const claudeProcess = spawn(this.claudePath, args, {
        cwd,
        signal: abortController.signal,
        env: { ...process.env },
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.process = claudeProcess;
      this.outputBuffer = "";

      claudeProcess.stdout?.on("data", (data: Buffer) => {
        const chunk = data.toString();
        this.outputBuffer += chunk;

        // Report progress
        if (onProgress) {
          onProgress({
            taskId,
            type: "partial_result",
            content: chunk,
            timestamp: new Date().toISOString(),
          });
        }
      });

      claudeProcess.stderr?.on("data", (data: Buffer) => {
        const errChunk = data.toString();
        // Claude sends status info to stderr, not always errors
        if (onProgress) {
          onProgress({
            taskId,
            type: "status_update",
            content: errChunk,
            timestamp: new Date().toISOString(),
          });
        }
      });

      claudeProcess.on("close", (code) => {
        this.process = null;
        const execution = this.currentExecution;
        this.currentExecution = null;

        if (!execution) return;

        if (abortController.signal.aborted) {
          execution.reject(new Error("Task cancelled"));
          return;
        }

        if (code !== 0 && !this.outputBuffer.trim()) {
          execution.reject(
            new Error(`Claude process exited with code ${code}`),
          );
          return;
        }

        execution.resolve(this.outputBuffer.trim());
      });

      claudeProcess.on("error", (err) => {
        this.process = null;
        const execution = this.currentExecution;
        this.currentExecution = null;

        if (execution) {
          execution.reject(err);
        }
      });
    });
  }

  cancelCurrentTask(): void {
    if (this.currentExecution) {
      this.currentExecution.abortController.abort();
    }
    if (this.process) {
      this.process.kill("SIGTERM");
    }
  }

  getSessionId(): string | undefined {
    return this.sessionId;
  }

  isRunning(): boolean {
    return this.currentExecution !== null;
  }
}
