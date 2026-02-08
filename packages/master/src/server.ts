import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { readFileSync } from "node:fs";
import { Server as SocketIOServer } from "socket.io";
import { jwtVerify } from "jose";
import {
  C2S,
  S2C,
  DASHBOARD_C2S,
  SOCKET_MAX_BUFFER_SIZE,
  AuthPayloadSchema,
  HeartbeatPayloadSchema,
  TaskRequestSchema,
  TaskResultSchema,
  TaskProgressSchema,
} from "@remote-subagent/shared";
import { NodeRegistry } from "./registry.js";
import { MessageRouter } from "./router.js";
import { Logger } from "./logger.js";
import { RestApi } from "./api.js";

export interface MasterConfig {
  port: number;
  jwtSecret: string;
  dashboardSecret: string;
  tlsCertPath?: string;
  tlsKeyPath?: string;
}

export async function startMasterServer(config: MasterConfig) {
  // Create HTTP/HTTPS server (ADR-8)
  let httpServer;
  if (config.tlsCertPath && config.tlsKeyPath) {
    httpServer = createHttpsServer({
      cert: readFileSync(config.tlsCertPath),
      key: readFileSync(config.tlsKeyPath),
    });
    console.log("Starting with TLS enabled");
  } else {
    httpServer = createHttpServer();
    console.log("Starting without TLS (HTTP mode)");
  }

  // Socket.IO server
  const io = new SocketIOServer(httpServer, {
    cors: { origin: "*" },
    maxHttpBufferSize: SOCKET_MAX_BUFFER_SIZE,
    connectionStateRecovery: { maxDisconnectionDuration: 120_000 },
    pingInterval: 10_000,
    pingTimeout: 20_000,
  });

  const logger = new Logger(io);
  const registry = new NodeRegistry(io, logger);
  const router = new MessageRouter(io, registry, logger);
  const api = new RestApi(registry, router, logger, {
    dashboardSecret: config.dashboardSecret,
    jwtSecret: config.jwtSecret,
  });

  const jwtSecretKey = new TextEncoder().encode(config.jwtSecret);

  // REST API handler
  httpServer.on("request", api.handler);

  // ===== Default namespace (node-agent / mcp-server) =====
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error("Authentication required"));
    }

    try {
      const { payload } = await jwtVerify(token, jwtSecretKey);
      (socket as any).jwtPayload = payload;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    logger.debug("server", `Socket connected: ${socket.id}`);

    // Authentication
    socket.on(C2S.AUTHENTICATE, (data: unknown) => {
      const parsed = AuthPayloadSchema.safeParse(data);
      if (!parsed.success) {
        socket.emit(S2C.AUTH_RESULT, {
          success: false,
          message: `Invalid auth payload: ${parsed.error.message}`,
        });
        return;
      }

      registry.registerNode(socket, parsed.data);
      socket.emit(S2C.AUTH_RESULT, {
        success: true,
        message: "Authenticated",
      });
    });

    // Heartbeat (ADR-16: metrics integrated)
    socket.on(C2S.HEARTBEAT, (data: unknown) => {
      const parsed = HeartbeatPayloadSchema.safeParse(data);
      if (!parsed.success) return;

      const mapping = registry.getNodeForSocket(socket.id);
      if (!mapping) return;

      if (mapping.type === "mcp") {
        registry.updateMcpHeartbeat(mapping.nodeId);
      } else {
        registry.updateHeartbeat(
          parsed.data.nodeId,
          parsed.data.status,
          parsed.data.currentTaskId,
          parsed.data.queueLength,
          parsed.data.metrics,
        );
      }
    });

    // Task request from node/MCP
    socket.on(C2S.TASK_REQUEST, (data: unknown) => {
      const parsed = TaskRequestSchema.safeParse(data);
      if (!parsed.success) {
        socket.emit(S2C.ERROR, {
          message: `Invalid task request: ${parsed.error.message}`,
        });
        return;
      }
      router.routeTask(socket, parsed.data);
    });

    // Task result from node
    socket.on(C2S.TASK_RESULT, (data: unknown) => {
      const parsed = TaskResultSchema.safeParse(data);
      if (!parsed.success) {
        logger.warn("server", `Invalid task result: ${parsed.error.message}`);
        return;
      }
      router.handleResult(parsed.data);
    });

    // Task progress from node
    socket.on(C2S.TASK_PROGRESS, (data: unknown) => {
      const parsed = TaskProgressSchema.safeParse(data);
      if (!parsed.success) return;
      router.handleProgress(parsed.data);
    });

    // Task cancel from node/MCP
    socket.on(C2S.TASK_CANCEL, (data: { taskId: string }) => {
      if (data?.taskId) {
        router.cancelTask(data.taskId);
      }
    });

    // List nodes (for MCP)
    socket.on(C2S.LIST_NODES, (callback: (nodes: unknown) => void) => {
      const nodes = registry.getAgentNodes();
      if (typeof callback === "function") {
        callback(nodes);
      } else {
        socket.emit(S2C.NODES_LIST, nodes);
      }
    });

    socket.on("disconnect", (reason) => {
      registry.unregisterSocket(socket.id);
      logger.debug("server", `Socket disconnected: ${socket.id} (${reason})`);
    });
  });

  // ===== Dashboard namespace (ADR-15) =====
  const dashboardNsp = io.of("/dashboard");

  dashboardNsp.use((socket, next) => {
    const secret = socket.handshake.auth?.secret;
    if (secret !== config.dashboardSecret) {
      return next(new Error("Invalid dashboard secret"));
    }
    next();
  });

  dashboardNsp.on("connection", (socket) => {
    logger.info("server", `Dashboard client connected: ${socket.id}`);

    socket.on(DASHBOARD_C2S.SUBSCRIBE, () => {
      // Send current state
      socket.emit("dashboard:nodes_update", registry.getAgentNodes());
    });

    socket.on("disconnect", () => {
      logger.info("server", `Dashboard client disconnected: ${socket.id}`);
    });
  });

  // Start server
  httpServer.listen(config.port, () => {
    const protocol = config.tlsCertPath ? "https" : "http";
    logger.info(
      "server",
      `Master server listening on ${protocol}://0.0.0.0:${config.port}`,
    );
  });

  return { io, httpServer, registry, router, logger };
}
