import { createTaskError, type TaskRequest, type TaskResult } from "@remote-subagent/shared";

export type TaskExecutor = (
  task: TaskRequest,
) => Promise<TaskResult>;

interface QueuedTask {
  request: TaskRequest;
  startedAt?: number;
}

export class TaskQueue {
  private queue: QueuedTask[] = [];
  private currentTask: QueuedTask | null = null;
  private processing = false;
  private executor: TaskExecutor | null = null;
  private onResult: ((result: TaskResult) => void) | null = null;
  private cancelFn: (() => void) | null = null;

  constructor(private maxQueueSize: number) {}

  setExecutor(executor: TaskExecutor): void {
    this.executor = executor;
  }

  setOnResult(callback: (result: TaskResult) => void): void {
    this.onResult = callback;
  }

  setCancelFn(cancelFn: () => void): void {
    this.cancelFn = cancelFn;
  }

  enqueue(task: TaskRequest): boolean {
    if (this.queue.length >= this.maxQueueSize) {
      return false; // QUEUE_FULL
    }
    this.queue.push({ request: task });
    this.processNext();
    return true;
  }

  cancelTask(taskId: string): boolean {
    // Check if it's in queue
    const queueIdx = this.queue.findIndex((q) => q.request.taskId === taskId);
    if (queueIdx !== -1) {
      const removed = this.queue.splice(queueIdx, 1)[0];
      // Return cancelled result
      if (this.onResult) {
        this.onResult({
          taskId,
          sourceNodeId: removed.request.sourceNodeId,
          targetNodeId: removed.request.targetNodeId,
          success: false,
          error: createTaskError("CANCELLED", "Task cancelled from queue"),
          durationMs: 0,
          completedAt: new Date().toISOString(),
        });
      }
      return true;
    }

    // Check if it's currently executing
    if (this.currentTask?.request.taskId === taskId) {
      if (this.cancelFn) {
        this.cancelFn();
      }
      return true;
    }

    return false;
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  getCurrentTaskId(): string | null {
    return this.currentTask?.request.taskId || null;
  }

  isProcessing(): boolean {
    return this.processing;
  }

  private async processNext(): Promise<void> {
    if (this.processing || this.queue.length === 0 || !this.executor) return;

    this.processing = true;
    const queued = this.queue.shift()!;
    queued.startedAt = Date.now();
    this.currentTask = queued;

    try {
      const result = await this.executor(queued.request);
      if (this.onResult) {
        this.onResult(result);
      }
    } catch (err) {
      if (this.onResult) {
        this.onResult({
          taskId: queued.request.taskId,
          sourceNodeId: queued.request.sourceNodeId,
          targetNodeId: queued.request.targetNodeId,
          success: false,
          error: createTaskError(
            "EXECUTION_ERROR",
            err instanceof Error ? err.message : String(err),
          ),
          durationMs: queued.startedAt ? Date.now() - queued.startedAt : 0,
          completedAt: new Date().toISOString(),
        });
      }
    } finally {
      this.currentTask = null;
      this.processing = false;
      // Process next in queue
      this.processNext();
    }
  }
}
