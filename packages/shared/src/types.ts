import type { ErrorCode, TaskError } from "./errors.js";

// --- Node Info ---
export type NodeStatus = "online" | "offline" | "running";
export type ConnectionType = "agent" | "mcp";

export interface NodeInfo {
  nodeId: string;
  nodeName: string;
  platform: string;
  arch: string;
  nodeVersion: string;
  status: NodeStatus;
  connectionType: ConnectionType;
  connectedAt: string;
  lastHeartbeat: string;
  capabilities: string[];
  currentTaskId: string | null;
  queueLength: number;
  metrics: SystemMetrics | null;
  sessionId?: string;
}

export interface SystemMetrics {
  cpuPercent: number;
  memoryUsedMB: number;
  memoryTotalMB: number;
  diskUsedGB: number;
  diskTotalGB: number;
  timestamp: string;
}

// --- Task Payloads ---
export interface PromptPayload {
  type: "prompt";
  prompt: string;
  cwd?: string;
  model?: string;
  maxTurns?: number;
}

export type TaskPayload = PromptPayload;

export type TaskType = "prompt";

// --- Task Request ---
export interface TaskRequest {
  taskId: string;
  sourceNodeId: string;
  targetNodeId: string;
  type: TaskType;
  payload: TaskPayload;
  context?: string;
  createdAt: string;
  timeoutMs: number;
}

// --- Task Result ---
export interface TaskResult {
  taskId: string;
  sourceNodeId: string;
  targetNodeId: string;
  success: boolean;
  result?: string;
  error?: TaskError;
  durationMs: number;
  completedAt: string;
}

// --- Log Entry ---
export type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  source: string;
  event: string;
  details?: string;
  taskId?: string;
}

// --- Task Progress ---
export interface TaskProgress {
  taskId: string;
  nodeId: string;
  type: "partial_result" | "status_update";
  content: string;
  timestamp: string;
}

// --- Auth ---
export interface AuthPayload {
  nodeId: string;
  nodeName: string;
  platform: string;
  arch: string;
  nodeVersion: string;
  connectionType: ConnectionType;
  capabilities: string[];
  token: string;
}

export interface AuthResult {
  success: boolean;
  message: string;
}

// --- Heartbeat ---
export interface HeartbeatPayload {
  nodeId: string;
  status: NodeStatus;
  currentTaskId: string | null;
  queueLength: number;
  metrics: SystemMetrics;
  timestamp: string;
}

// Re-export error types
export type { ErrorCode, TaskError };
