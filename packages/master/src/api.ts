import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import {
  DEFAULT_TASK_TIMEOUT_MS,
  type TaskRequest,
  type TaskPayload,
} from "@remote-subagent/shared";
import type { NodeRegistry } from "./registry.js";
import type { MessageRouter } from "./router.js";
import type { Logger } from "./logger.js";
import type { SessionManager } from "./session-manager.js";

export class RestApi {
  private dashboardSecret: string;
  private jwtSecret: string;
  private startTime = Date.now();
  private settings = {
    sessionPersistence: process.env.SESSION_PERSISTENCE !== "false",
  };

  constructor(
    private registry: NodeRegistry,
    private router: MessageRouter,
    private logger: Logger,
    config: { dashboardSecret: string; jwtSecret: string },
    private sessionManager?: SessionManager,
  ) {
    this.dashboardSecret = config.dashboardSecret;
    this.jwtSecret = config.jwtSecret;
  }

  handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    // Let Socket.IO handle its own requests
    if (url.pathname.startsWith("/socket.io/")) {
      return;
    }

    // Only handle /api/* routes
    if (!url.pathname.startsWith("/api/")) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    // Verify X-Dashboard-Secret (ADR-12)
    const secret = req.headers["x-dashboard-secret"];
    if (secret !== this.dashboardSecret) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Forbidden: invalid dashboard secret" }));
      return;
    }

    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, X-Dashboard-Secret",
    );

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      if (url.pathname === "/api/nodes" && req.method === "GET") {
        await this.handleGetNodes(res);
      } else if (url.pathname === "/api/logs" && req.method === "GET") {
        await this.handleGetLogs(req, res, url);
      } else if (url.pathname === "/api/command" && req.method === "POST") {
        await this.handlePostCommand(req, res);
      } else if (url.pathname === "/api/metrics" && req.method === "GET") {
        await this.handleGetMetrics(res);
      } else if (url.pathname === "/api/tasks" && req.method === "GET") {
        await this.handleGetTasks(res, url);
      } else if (url.pathname === "/api/tokens" && req.method === "POST") {
        await this.handlePostToken(req, res);
      } else if (url.pathname.startsWith("/api/tasks/") && req.method === "DELETE") {
        const taskId = url.pathname.split("/api/tasks/")[1];
        await this.handleCancelTask(res, taskId);
      } else if (url.pathname === "/api/sessions" && req.method === "GET") {
        await this.handleGetSessions(res, url);
      } else if (url.pathname.startsWith("/api/sessions/") && req.method === "DELETE") {
        const sessionId = url.pathname.split("/api/sessions/")[1];
        await this.handleDeleteSession(res, sessionId);
      } else if (url.pathname === "/api/settings" && req.method === "GET") {
        await this.handleGetSettings(res);
      } else if (url.pathname === "/api/settings" && req.method === "PUT") {
        await this.handlePutSettings(req, res);
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
      }
    } catch (err) {
      this.logger.error("api", "Request error", String(err));
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  };

  private async handleGetNodes(res: ServerResponse): Promise<void> {
    const nodes = this.registry.getAgentNodes();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(nodes));
  }

  private async handleGetLogs(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<void> {
    const level = url.searchParams.get("level") as
      | "info"
      | "warn"
      | "error"
      | "debug"
      | null;
    const source = url.searchParams.get("source") || undefined;
    const search = url.searchParams.get("search") || undefined;
    const limit = url.searchParams.get("limit")
      ? parseInt(url.searchParams.get("limit")!, 10)
      : undefined;

    const logs = this.logger.getLogs({
      level: level || undefined,
      source,
      search,
      limit,
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(logs));
  }

  private async handlePostCommand(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const body = await readBody(req);
    const { targetNodeId, type, payload, timeoutMs, context } = JSON.parse(body);

    if (!targetNodeId || !type || !payload) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Missing required fields: targetNodeId, type, payload",
        }),
      );
      return;
    }

    const timeout = timeoutMs || DEFAULT_TASK_TIMEOUT_MS;

    if (targetNodeId === "all") {
      // Fan-out to all online nodes
      const onlineNodes = this.registry.getOnlineAgentNodes();
      const broadcastId = randomUUID();
      const tasks: { taskId: string; targetNodeId: string }[] = [];

      for (const node of onlineNodes) {
        const request = this.router.createTaskRequest(
          "dashboard",
          node.nodeId,
          type,
          payload as TaskPayload,
          timeout,
          context,
        );
        tasks.push({ taskId: request.taskId, targetNodeId: node.nodeId });
        this.router.routeTaskFromApi(request);
      }

      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ taskIds: tasks.map((t) => t.taskId), tasks, broadcastId }));
    } else {
      const request = this.router.createTaskRequest(
        "dashboard",
        targetNodeId,
        type,
        payload as TaskPayload,
        timeout,
        context,
      );

      this.router.routeTaskFromApi(request);

      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ taskId: request.taskId, targetNodeId }));
    }
  }

  private async handleGetMetrics(res: ServerResponse): Promise<void> {
    const stats = this.registry.getStats();
    const activeTasks = this.router.getActiveTasks();
    const todayCount = this.router.getTodayTaskCount();
    const uptimeMs = Date.now() - this.startTime;

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ...stats,
        activeTasks: activeTasks.length,
        todayTaskCount: todayCount,
        uptimeMs,
        version: "1.0.0",
      }),
    );
  }

  private async handleGetTasks(
    res: ServerResponse,
    url: URL,
  ): Promise<void> {
    const nodeId = url.searchParams.get("nodeId") || undefined;
    const active = url.searchParams.get("active") === "true";

    if (active) {
      const tasks = this.router.getActiveTasks();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(tasks));
    } else {
      const history = this.router.getTaskHistory(nodeId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(history));
    }
  }

  private async handlePostToken(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const body = await readBody(req);
    const { nodeId } = JSON.parse(body);

    if (!nodeId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing required field: nodeId" }));
      return;
    }

    // Generate JWT using jose
    const { SignJWT } = await import("jose");
    const secret = new TextEncoder().encode(this.jwtSecret);
    const token = await new SignJWT({ nodeId })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .sign(secret);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ token, nodeId }));
    this.logger.info("api", `Token generated for node: ${nodeId}`);
  }

  private async handleCancelTask(
    res: ServerResponse,
    taskId: string,
  ): Promise<void> {
    const success = this.router.cancelTask(taskId);
    if (success) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, taskId }));
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Task not found or already completed" }));
    }
  }

  private async handleGetSessions(
    res: ServerResponse,
    url: URL,
  ): Promise<void> {
    if (!this.sessionManager) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify([]));
      return;
    }
    const nodeId = url.searchParams.get("nodeId") || undefined;
    const sessions = this.sessionManager.listSessions(nodeId);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(sessions));
  }

  private async handleDeleteSession(
    res: ServerResponse,
    sessionId: string,
  ): Promise<void> {
    if (!this.sessionManager) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session management not available" }));
      return;
    }
    const deleted = this.sessionManager.deleteSession(sessionId);
    if (deleted) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, sessionId }));
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session not found" }));
    }
  }

  private async handleGetSettings(res: ServerResponse): Promise<void> {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(this.settings));
  }

  private async handlePutSettings(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const body = await readBody(req);
    const updates = JSON.parse(body);

    if (typeof updates.sessionPersistence === "boolean") {
      this.settings.sessionPersistence = updates.sessionPersistence;
      this.logger.info(
        "api",
        `Session persistence ${updates.sessionPersistence ? "enabled" : "disabled"}`,
      );
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(this.settings));
  }

  getSettings(): { sessionPersistence: boolean } {
    return this.settings;
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}
