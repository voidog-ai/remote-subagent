import os from "node:os";
import { io as ioClient, type Socket } from "socket.io-client";
import {
  C2S,
  S2C,
  HEARTBEAT_INTERVAL_MS,
  createTaskError,
  type AuthPayload,
  type HeartbeatPayload,
  type TaskRequest,
  type TaskResult,
  type NodeStatus,
} from "@remote-subagent/shared";
import type { AgentConfig } from "./config.js";
import { TaskQueue } from "./task-queue.js";
import { TaskExecutor } from "./executor.js";
import { collectMetrics } from "./metrics.js";

export class NodeAgent {
  private socket: Socket;
  private config: AgentConfig;
  private taskQueue: TaskQueue;
  private executor: TaskExecutor;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(config: AgentConfig) {
    this.config = config;
    this.taskQueue = new TaskQueue(config.maxQueueSize);
    this.executor = new TaskExecutor(config);

    // Set up task execution pipeline
    this.taskQueue.setExecutor((request) => this.executor.execute(request));
    this.taskQueue.setOnResult((result) => this.sendResult(result));
    this.taskQueue.setCancelFn(() => this.executor.cancelCurrentTask());

    // Set up progress reporting
    this.executor.setOnProgress((progress) => {
      this.socket.emit(C2S.TASK_PROGRESS, progress);
    });

    // Create Socket.IO client
    this.socket = ioClient(config.masterUrl, {
      auth: { token: config.token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      transports: ["websocket", "polling"],
    });

    this.setupSocketHandlers();
  }

  private setupSocketHandlers(): void {
    this.socket.on("connect", () => {
      console.log(`[agent] Connected to master: ${this.config.masterUrl}`);
      this.authenticate();
      this.startHeartbeat();
    });

    this.socket.on(S2C.AUTH_RESULT, (result: { success: boolean; message: string }) => {
      if (result.success) {
        console.log(`[agent] Authenticated as: ${this.config.nodeId}`);
      } else {
        console.error(`[agent] Authentication failed: ${result.message}`);
      }
    });

    // Task assignment
    this.socket.on(S2C.TASK_ASSIGN, (request: TaskRequest) => {
      console.log(
        `[agent] Task assigned: ${request.taskId} [${request.type}]`,
      );

      const enqueued = this.taskQueue.enqueue(request);
      if (!enqueued) {
        // Queue full - send immediate error
        const errorResult: TaskResult = {
          taskId: request.taskId,
          sourceNodeId: request.sourceNodeId,
          targetNodeId: request.targetNodeId,
          success: false,
          error: createTaskError(
            "QUEUE_FULL",
            `Task queue is full (max: ${this.config.maxQueueSize})`,
          ),
          durationMs: 0,
          completedAt: new Date().toISOString(),
        };
        this.sendResult(errorResult);
      }
    });

    // Task cancellation
    this.socket.on(S2C.TASK_CANCEL, (data: { taskId: string }) => {
      console.log(`[agent] Task cancel requested: ${data.taskId}`);
      this.taskQueue.cancelTask(data.taskId);
    });

    this.socket.on("disconnect", (reason) => {
      console.log(`[agent] Disconnected: ${reason}`);
      this.stopHeartbeat();
    });

    this.socket.on("connect_error", (err) => {
      console.error(`[agent] Connection error: ${err.message}`);
    });
  }

  private authenticate(): void {
    const authPayload: AuthPayload = {
      nodeId: this.config.nodeId,
      nodeName: this.config.nodeName,
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      connectionType: "agent",
      capabilities: ["prompt"],
      token: this.config.token,
    };

    this.socket.emit(C2S.AUTHENTICATE, authPayload);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);
    // Send initial heartbeat
    this.sendHeartbeat();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private sendHeartbeat(): void {
    const status: NodeStatus = this.taskQueue.isProcessing()
      ? "busy"
      : "online";

    const heartbeat: HeartbeatPayload = {
      nodeId: this.config.nodeId,
      status,
      currentTaskId: this.taskQueue.getCurrentTaskId(),
      queueLength: this.taskQueue.getQueueLength(),
      metrics: collectMetrics(),
      timestamp: new Date().toISOString(),
    };

    this.socket.emit(C2S.HEARTBEAT, heartbeat);
  }

  private sendResult(result: TaskResult): void {
    this.socket.emit(C2S.TASK_RESULT, result);
    console.log(
      `[agent] Task result sent: ${result.taskId} (success: ${result.success}, ${result.durationMs}ms)`,
    );
  }

  async start(): Promise<void> {
    console.log(`[agent] Starting node agent: ${this.config.nodeId}`);
    console.log(`[agent] Master URL: ${this.config.masterUrl}`);
    console.log(`[agent] Platform: ${process.platform}/${process.arch}`);
    // Connection is automatic via Socket.IO
  }

  async stop(): Promise<void> {
    this.stopHeartbeat();
    this.socket.disconnect();
    console.log("[agent] Stopped");
  }
}
