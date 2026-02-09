import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { isAbsolute } from "node:path";
import type { PromptPayload, TaskProgress } from "@remote-subagent/shared";

interface TaskExecution {
  resolve: (result: { output: string; sessionId?: string }) => void;
  reject: (error: Error) => void;
  abortController: AbortController;
  taskId: string;
}

export class ClaudeSession {
  private process: ChildProcess | null = null;
  private currentExecution: TaskExecution | null = null;
  private model: string;
  private claudePath: string;
  private sessionPersistence: boolean;
  private outputBuffer = "";

  constructor(model: string, claudePath = "claude", sessionPersistence = true) {
    this.model = model;
    this.claudePath = claudePath;
    this.sessionPersistence = sessionPersistence;
  }

  async executeTask(
    task: PromptPayload,
    taskId: string,
    context?: string,
    onProgress?: (progress: Omit<TaskProgress, "nodeId">) => void,
  ): Promise<{ output: string; sessionId?: string }> {
    const abortController = new AbortController();

    // Build prompt with context
    let fullPrompt = "";
    if (context) {
      fullPrompt += `[Context from requesting agent]: ${context}\n\n`;
    }
    fullPrompt += task.prompt;

    // Determine session flags
    let sessionId: string | undefined;
    const sessionArgs: string[] = [];

    if (this.sessionPersistence) {
      if (task.sessionId) {
        // Resume existing session
        sessionArgs.push("--resume", task.sessionId);
        sessionId = task.sessionId;
      } else {
        // Start new session
        sessionId = randomUUID();
        sessionArgs.push("--session-id", sessionId);
      }
    }

    return new Promise<{ output: string; sessionId?: string }>((resolve, reject) => {
      this.currentExecution = {
        resolve,
        reject,
        abortController,
        taskId,
      };

      // Build claude command args
      // Prompt is fed via stdin to avoid shell escaping issues
      // and CLI hanging when passed as a positional argument
      const args = [
        "--print",
        "--dangerously-skip-permissions",
        "--output-format",
        "text",
        "--model",
        task.model || this.model,
        ...sessionArgs,
      ];

      if (task.maxTurns) {
        args.push("--max-turns", String(task.maxTurns));
      }

      const cwd = task.cwd && existsSync(task.cwd) ? task.cwd : process.env.HOME || process.cwd();

      if (isAbsolute(this.claudePath) && !existsSync(this.claudePath)) {
        reject(new Error(`Claude CLI not found at: ${this.claudePath}`));
        return;
      }

      const claudeProcess = spawn(this.claudePath, args, {
        cwd,
        signal: abortController.signal,
        env: { ...process.env },
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.process = claudeProcess;
      this.outputBuffer = "";

      // Feed prompt via stdin
      claudeProcess.stdin?.write(fullPrompt);
      claudeProcess.stdin?.end();

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

        execution.resolve({
          output: this.outputBuffer.trim(),
          sessionId,
        });
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

  isRunning(): boolean {
    return this.currentExecution !== null;
  }
}
