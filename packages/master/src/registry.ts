import type { Socket } from "socket.io";
import {
  MCP_TTL_MS,
  DASHBOARD_S2C,
  type NodeInfo,
  type SystemMetrics,
  type ConnectionType,
  type AuthPayload,
  createTaskError,
} from "@remote-subagent/shared";
import type { Logger } from "./logger.js";
import type { Server as SocketIOServer } from "socket.io";

interface McpInfo {
  sessionId: string;
  nodeId: string;
  socketId: string;
  connectedAt: string;
  lastHeartbeat: string;
}

export class NodeRegistry {
  private agents = new Map<string, NodeInfo>();
  private mcpClients = new Map<string, McpInfo>();
  private socketToNode = new Map<string, { nodeId: string; type: ConnectionType }>();
  private nodeToSocket = new Map<string, Socket>();
  private mcpCleanupInterval: NodeJS.Timeout;

  constructor(
    private io: SocketIOServer,
    private logger: Logger,
  ) {
    // MCP TTL cleanup every 30 seconds
    this.mcpCleanupInterval = setInterval(() => {
      this.cleanupMcpClients();
    }, 30_000);
  }

  registerNode(socket: Socket, auth: AuthPayload): void {
    const now = new Date().toISOString();

    if (auth.connectionType === "mcp") {
      const mcpInfo: McpInfo = {
        sessionId: auth.nodeId,
        nodeId: auth.nodeId,
        socketId: socket.id,
        connectedAt: now,
        lastHeartbeat: now,
      };
      this.mcpClients.set(auth.nodeId, mcpInfo);
      this.socketToNode.set(socket.id, {
        nodeId: auth.nodeId,
        type: "mcp",
      });
      this.logger.info("registry", `MCP client registered: ${auth.nodeId}`);
    } else {
      const nodeInfo: NodeInfo = {
        nodeId: auth.nodeId,
        nodeName: auth.nodeName,
        platform: auth.platform,
        arch: auth.arch,
        nodeVersion: auth.nodeVersion,
        status: "online",
        connectionType: "agent",
        connectedAt: now,
        lastHeartbeat: now,
        capabilities: auth.capabilities,
        currentTaskId: null,
        queueLength: 0,
        metrics: null,
      };

      // Idempotent re-registration (ADR-11)
      const existing = this.agents.get(auth.nodeId);
      if (existing) {
        nodeInfo.connectedAt = existing.connectedAt;
        this.logger.info("registry", `Node re-registered: ${auth.nodeId}`);
      } else {
        this.logger.info("registry", `Node registered: ${auth.nodeId} (${auth.nodeName})`);
      }

      this.agents.set(auth.nodeId, nodeInfo);
      this.socketToNode.set(socket.id, {
        nodeId: auth.nodeId,
        type: "agent",
      });
      this.nodeToSocket.set(auth.nodeId, socket);

      this.broadcastNodesUpdate();
    }
  }

  unregisterSocket(socketId: string): void {
    const mapping = this.socketToNode.get(socketId);
    if (!mapping) return;

    this.socketToNode.delete(socketId);

    if (mapping.type === "mcp") {
      this.mcpClients.delete(mapping.nodeId);
      this.logger.info("registry", `MCP client disconnected: ${mapping.nodeId}`);
    } else {
      const node = this.agents.get(mapping.nodeId);
      if (node) {
        node.status = "offline";
        this.nodeToSocket.delete(mapping.nodeId);
        this.logger.info("registry", `Node disconnected: ${mapping.nodeId}`);
        this.broadcastNodesUpdate();
      }
    }
  }

  updateHeartbeat(
    nodeId: string,
    status: NodeInfo["status"],
    currentTaskId: string | null,
    queueLength: number,
    metrics: SystemMetrics,
  ): void {
    const node = this.agents.get(nodeId);
    if (!node) return;

    const prevStatus = node.status;
    node.status = status;
    node.currentTaskId = currentTaskId;
    node.queueLength = queueLength;
    node.metrics = metrics;
    node.lastHeartbeat = new Date().toISOString();

    // Broadcast metrics update
    this.io
      .of("/dashboard")
      .emit(DASHBOARD_S2C.METRICS_UPDATE, { nodeId, metrics });

    // Broadcast status change if applicable
    if (prevStatus !== status) {
      this.broadcastNodesUpdate();
    }
  }

  updateMcpHeartbeat(sessionId: string): void {
    const mcp = this.mcpClients.get(sessionId);
    if (mcp) {
      mcp.lastHeartbeat = new Date().toISOString();
    }
  }

  getAgentNodes(): NodeInfo[] {
    return Array.from(this.agents.values());
  }

  getOnlineAgentNodes(): NodeInfo[] {
    return this.getAgentNodes().filter((n) => n.status !== "offline");
  }

  getNode(nodeId: string): NodeInfo | undefined {
    return this.agents.get(nodeId);
  }

  getSocketForNode(nodeId: string): Socket | undefined {
    return this.nodeToSocket.get(nodeId);
  }

  getNodeForSocket(socketId: string): { nodeId: string; type: ConnectionType } | undefined {
    return this.socketToNode.get(socketId);
  }

  getNodeForTask(nodeId: string):
    | { node: NodeInfo; socket: Socket; error?: undefined }
    | { error: import("@remote-subagent/shared").TaskError; node?: undefined; socket?: undefined }
  {
    const node = this.agents.get(nodeId);
    if (!node || node.status === "offline") {
      return {
        error: createTaskError("NODE_OFFLINE", `Node ${nodeId} is offline`),
      };
    }
    const socket = this.nodeToSocket.get(nodeId);
    if (!socket) {
      return {
        error: createTaskError("NODE_OFFLINE", `No socket for node ${nodeId}`),
      };
    }
    return { node, socket };
  }

  private cleanupMcpClients(): void {
    const now = Date.now();
    for (const [sessionId, mcp] of this.mcpClients) {
      const lastBeat = new Date(mcp.lastHeartbeat).getTime();
      if (now - lastBeat > MCP_TTL_MS) {
        this.mcpClients.delete(sessionId);
        this.socketToNode.delete(mcp.socketId);
        this.logger.warn(
          "registry",
          `MCP client expired (TTL): ${sessionId}`,
        );
      }
    }
  }

  private broadcastNodesUpdate(): void {
    this.io
      .of("/dashboard")
      .emit(DASHBOARD_S2C.NODES_UPDATE, this.getAgentNodes());
  }

  getStats(): {
    totalNodes: number;
    onlineNodes: number;
    runningNodes: number;
    mcpClients: number;
  } {
    const nodes = this.getAgentNodes();
    return {
      totalNodes: nodes.length,
      onlineNodes: nodes.filter((n) => n.status === "online").length,
      runningNodes: nodes.filter((n) => n.status === "running").length,
      mcpClients: this.mcpClients.size,
    };
  }

  destroy(): void {
    clearInterval(this.mcpCleanupInterval);
  }
}
