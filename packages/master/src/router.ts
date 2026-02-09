import { randomUUID } from "node:crypto";
import type { Socket, Server as SocketIOServer } from "socket.io";
import {
  S2C,
  DASHBOARD_S2C,
  TASK_HISTORY_MAX_SIZE,
  type TaskRequest,
  type TaskResult,
  type TaskProgress,
  createTaskError,
} from "@remote-subagent/shared";
import type { NodeRegistry } from "./registry.js";
import type { Logger } from "./logger.js";

type NodeLookupResult =
  | { node: import("@remote-subagent/shared").NodeInfo; socket: import("socket.io").Socket }
  | { error: import("@remote-subagent/shared").TaskError };

interface PendingTask {
  request: TaskRequest;
  sourceSocket: Socket;
  timeoutTimer: NodeJS.Timeout;
  startedAt: number;
}

export interface TaskHistoryEntry extends TaskResult {
  prompt?: string;
  createdAt?: string;
}

export class MessageRouter {
  private pendingTasks = new Map<string, PendingTask>();
  private taskHistory: TaskHistoryEntry[] = [];
  private dailyTaskCount = new Map<string, number>();

  constructor(
    private io: SocketIOServer,
    private registry: NodeRegistry,
    private logger: Logger,
  ) {}

  routeTask(sourceSocket: Socket, request: TaskRequest): void {
    // Check if target node exists and is reachable
    const lookup = this.registry.getNodeForTask(request.targetNodeId);
    if (lookup.error) {
      // Return error to source
      const errorResult: TaskResult = {
        taskId: request.taskId,
        sourceNodeId: request.sourceNodeId,
        targetNodeId: request.targetNodeId,
        success: false,
        error: lookup.error,
        durationMs: 0,
        completedAt: new Date().toISOString(),
      };
      sourceSocket.emit(S2C.TASK_RESPONSE, errorResult);
      this.logger.warn(
        "router",
        `Task ${request.taskId} rejected: ${lookup.error.message}`,
        undefined,
        request.taskId,
      );
      return;
    }

    const { node, socket: targetSocket } = lookup;

    // Set up timeout timer
    const timeoutTimer = setTimeout(() => {
      this.handleTaskTimeout(request.taskId);
    }, request.timeoutMs);

    // Register pending task
    this.pendingTasks.set(request.taskId, {
      request,
      sourceSocket,
      timeoutTimer,
      startedAt: Date.now(),
    });

    // Assign task to target node
    targetSocket.emit(S2C.TASK_ASSIGN, request);

    this.logger.info(
      "router",
      `Task ${request.taskId} routed: ${request.sourceNodeId} → ${request.targetNodeId} [${request.type}]`,
      undefined,
      request.taskId,
    );
  }

  routeTaskFromApi(request: TaskRequest): void {
    const lookup = this.registry.getNodeForTask(request.targetNodeId);
    if (lookup.error) {
      const errorResult: TaskResult = {
        taskId: request.taskId,
        sourceNodeId: request.sourceNodeId,
        targetNodeId: request.targetNodeId,
        success: false,
        error: lookup.error,
        durationMs: 0,
        completedAt: new Date().toISOString(),
      };
      // Dashboard-sourced task, send to dashboard namespace
      this.io.of("/dashboard").emit(DASHBOARD_S2C.TASK_UPDATE, errorResult);
      return;
    }

    const { socket: targetSocket } = lookup;

    const timeoutTimer = setTimeout(() => {
      this.handleTaskTimeout(request.taskId);
    }, request.timeoutMs);

    this.pendingTasks.set(request.taskId, {
      request,
      sourceSocket: null as unknown as Socket, // No source socket for API tasks
      timeoutTimer,
      startedAt: Date.now(),
    });

    targetSocket.emit(S2C.TASK_ASSIGN, request);

    this.logger.info(
      "router",
      `Task ${request.taskId} routed (API): dashboard → ${request.targetNodeId} [${request.type}]`,
      undefined,
      request.taskId,
    );
  }

  handleResult(taskResult: TaskResult): void {
    const pending = this.pendingTasks.get(taskResult.taskId);
    if (!pending) {
      this.logger.warn(
        "router",
        `Received result for unknown task: ${taskResult.taskId}`,
        undefined,
        taskResult.taskId,
      );
      return;
    }

    // Clear timeout
    clearTimeout(pending.timeoutTimer);
    this.pendingTasks.delete(taskResult.taskId);

    // Add to history with prompt data from original request
    this.addToHistory(taskResult, pending.request);

    // Update daily count
    const today = new Date().toISOString().slice(0, 10);
    this.dailyTaskCount.set(today, (this.dailyTaskCount.get(today) || 0) + 1);

    // Route result back to source
    if (pending.request.sourceNodeId === "dashboard") {
      // Dashboard-originated task: send result to dashboard only
      this.io.of("/dashboard").emit(DASHBOARD_S2C.TASK_UPDATE, taskResult);
    } else {
      // MCP/agent-originated task: send result to source, and also notify dashboard
      if (pending.sourceSocket?.connected) {
        pending.sourceSocket.emit(S2C.TASK_RESPONSE, taskResult);
      }
      this.io.of("/dashboard").emit(DASHBOARD_S2C.TASK_UPDATE, taskResult);
    }

    const status = taskResult.success ? "completed" : "failed";
    this.logger.info(
      "router",
      `Task ${taskResult.taskId} ${status} (${taskResult.durationMs}ms)`,
      taskResult.error?.message,
      taskResult.taskId,
    );
  }

  handleProgress(progress: TaskProgress): void {
    const pending = this.pendingTasks.get(progress.taskId);

    // Forward to source
    if (pending?.sourceSocket?.connected) {
      pending.sourceSocket.emit(S2C.TASK_PROGRESS, progress);
    }

    // Forward to dashboard
    this.io.of("/dashboard").emit(DASHBOARD_S2C.TASK_PROGRESS, progress);
  }

  cancelTask(taskId: string): boolean {
    const pending = this.pendingTasks.get(taskId);
    if (!pending) return false;

    // Send cancel to target node
    const targetSocket = this.registry.getSocketForNode(
      pending.request.targetNodeId,
    );
    if (targetSocket) {
      targetSocket.emit(S2C.TASK_CANCEL, { taskId });
    }

    this.logger.info(
      "router",
      `Task ${taskId} cancel requested`,
      undefined,
      taskId,
    );
    return true;
  }

  private handleTaskTimeout(taskId: string): void {
    const pending = this.pendingTasks.get(taskId);
    if (!pending) return;

    // Send cancel to target node
    const targetSocket = this.registry.getSocketForNode(
      pending.request.targetNodeId,
    );
    if (targetSocket) {
      targetSocket.emit(S2C.TASK_CANCEL, { taskId });
    }

    // Create timeout result
    const timeoutResult: TaskResult = {
      taskId,
      sourceNodeId: pending.request.sourceNodeId,
      targetNodeId: pending.request.targetNodeId,
      success: false,
      error: createTaskError(
        "TIMEOUT",
        `Task timed out after ${pending.request.timeoutMs}ms`,
      ),
      durationMs: Date.now() - pending.startedAt,
      completedAt: new Date().toISOString(),
    };

    this.pendingTasks.delete(taskId);
    this.addToHistory(timeoutResult, pending.request);

    // Route result back
    if (pending.request.sourceNodeId === "dashboard") {
      this.io.of("/dashboard").emit(DASHBOARD_S2C.TASK_UPDATE, timeoutResult);
    } else if (pending.sourceSocket?.connected) {
      pending.sourceSocket.emit(S2C.TASK_RESPONSE, timeoutResult);
    }

    this.logger.warn(
      "router",
      `Task ${taskId} timed out`,
      undefined,
      taskId,
    );
  }

  private addToHistory(result: TaskResult, request: TaskRequest): void {
    const entry: TaskHistoryEntry = {
      ...result,
      prompt: request.payload.prompt,
      createdAt: request.createdAt,
    };
    this.taskHistory.push(entry);
    if (this.taskHistory.length > TASK_HISTORY_MAX_SIZE) {
      this.taskHistory.shift();
    }
  }

  getTaskHistory(nodeId?: string): TaskHistoryEntry[] {
    if (nodeId) {
      return this.taskHistory.filter(
        (t) => t.sourceNodeId === nodeId || t.targetNodeId === nodeId,
      );
    }
    return [...this.taskHistory];
  }

  getTodayTaskCount(): number {
    const today = new Date().toISOString().slice(0, 10);
    return this.dailyTaskCount.get(today) || 0;
  }

  getActiveTasks(): TaskRequest[] {
    return Array.from(this.pendingTasks.values()).map((p) => p.request);
  }

  createTaskRequest(
    sourceNodeId: string,
    targetNodeId: string,
    type: TaskRequest["type"],
    payload: TaskRequest["payload"],
    timeoutMs: number,
    context?: string,
  ): TaskRequest {
    return {
      taskId: randomUUID(),
      sourceNodeId,
      targetNodeId,
      type,
      payload,
      context,
      createdAt: new Date().toISOString(),
      timeoutMs,
    };
  }
}
