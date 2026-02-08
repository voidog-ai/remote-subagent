import { randomUUID } from "node:crypto";
import { io as ioClient, type Socket } from "socket.io-client";
import {
  C2S,
  S2C,
  MCP_HEARTBEAT_INTERVAL_MS,
  DEFAULT_TASK_TIMEOUT_MS,
  type AuthPayload,
  type TaskRequest,
  type TaskResult,
  type TaskProgress,
  type NodeInfo,
} from "@remote-subagent/shared";

interface PendingRequest {
  resolve: (result: TaskResult) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export class SocketClient {
  private sessionId = randomUUID();
  private socket: Socket;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private responseWaiters = new Map<string, PendingRequest>();
  private progressCallbacks = new Map<
    string,
    (progress: TaskProgress) => void
  >();
  private connected = false;
  private nodeId: string;

  constructor(
    private masterUrl: string,
    private baseNodeId: string,
    private token: string,
  ) {
    this.nodeId = `${baseNodeId}-mcp-${this.sessionId}`;

    this.socket = ioClient(masterUrl, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      transports: ["websocket", "polling"],
    });

    this.setupHandlers();
    this.setupCleanup();
  }

  private setupHandlers(): void {
    this.socket.on("connect", () => {
      console.error(`[mcp] Connected to master: ${this.masterUrl}`);
      this.authenticate();
      this.startHeartbeat();
      this.connected = true;
    });

    this.socket.on(S2C.AUTH_RESULT, (result: { success: boolean; message: string }) => {
      if (result.success) {
        console.error(`[mcp] Authenticated as: ${this.nodeId}`);
      } else {
        console.error(`[mcp] Authentication failed: ${result.message}`);
      }
    });

    this.socket.on(S2C.TASK_RESPONSE, (result: TaskResult) => {
      const waiter = this.responseWaiters.get(result.taskId);
      if (waiter) {
        clearTimeout(waiter.timer);
        this.responseWaiters.delete(result.taskId);
        this.progressCallbacks.delete(result.taskId);
        waiter.resolve(result);
      }
    });

    this.socket.on(S2C.TASK_PROGRESS, (progress: TaskProgress) => {
      const callback = this.progressCallbacks.get(progress.taskId);
      if (callback) {
        callback(progress);
      }
    });

    this.socket.on("disconnect", (reason) => {
      console.error(`[mcp] Disconnected: ${reason}`);
      this.connected = false;
      this.stopHeartbeat();
    });

    this.socket.on("connect_error", (err) => {
      console.error(`[mcp] Connection error: ${err.message}`);
    });
  }

  private authenticate(): void {
    const auth: AuthPayload = {
      nodeId: this.nodeId,
      nodeName: `MCP-${this.baseNodeId}`,
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      connectionType: "mcp",
      capabilities: [],
      token: this.token,
    };
    this.socket.emit(C2S.AUTHENTICATE, auth);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.socket.emit(C2S.HEARTBEAT, {
        nodeId: this.nodeId,
        status: "online",
        currentTaskId: null,
        queueLength: 0,
        metrics: {
          cpuPercent: 0,
          memoryUsedMB: 0,
          memoryTotalMB: 0,
          diskUsedGB: 0,
          diskTotalGB: 0,
          timestamp: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      });
    }, MCP_HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  setupCleanup(): void {
    const cleanup = () => {
      this.disconnect();
    };
    process.on("SIGTERM", cleanup);
    process.on("SIGINT", cleanup);
    process.on("beforeExit", cleanup);
  }

  disconnect(): void {
    this.stopHeartbeat();
    // Reject all pending waiters
    for (const [taskId, waiter] of this.responseWaiters) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error("MCP server shutting down"));
    }
    this.responseWaiters.clear();
    this.progressCallbacks.clear();
    this.socket.disconnect();
  }

  async listNodes(): Promise<NodeInfo[]> {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        reject(new Error("Not connected to master"));
        return;
      }

      const timer = setTimeout(() => {
        reject(new Error("List nodes timed out"));
      }, 10_000);

      this.socket.emit(
        C2S.LIST_NODES,
        (nodes: NodeInfo[]) => {
          clearTimeout(timer);
          resolve(nodes);
        },
      );
    });
  }

  async sendTask(
    targetNodeId: string,
    type: TaskRequest["type"],
    payload: TaskRequest["payload"],
    timeoutMs: number = DEFAULT_TASK_TIMEOUT_MS,
    context?: string,
    onProgress?: (progress: TaskProgress) => void,
  ): Promise<TaskResult> {
    if (!this.connected) {
      throw new Error("Not connected to master");
    }

    const taskId = randomUUID();

    const request: TaskRequest = {
      taskId,
      sourceNodeId: this.nodeId,
      targetNodeId,
      type,
      payload,
      context,
      createdAt: new Date().toISOString(),
      timeoutMs,
    };

    return new Promise<TaskResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.responseWaiters.delete(taskId);
        this.progressCallbacks.delete(taskId);
        reject(new Error(`Task timed out after ${timeoutMs}ms`));
      }, timeoutMs + 5_000); // Extra 5s for network latency

      this.responseWaiters.set(taskId, { resolve, reject, timer });

      if (onProgress) {
        this.progressCallbacks.set(taskId, onProgress);
      }

      this.socket.emit(C2S.TASK_REQUEST, request);
    });
  }

  async cancelTask(taskId: string): Promise<void> {
    this.socket.emit(C2S.TASK_CANCEL, { taskId });
  }

  isConnected(): boolean {
    return this.connected;
  }

  getNodeId(): string {
    return this.nodeId;
  }
}
