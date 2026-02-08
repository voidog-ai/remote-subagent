import { z } from "zod";

// --- System Metrics Schema ---
export const SystemMetricsSchema = z.object({
  cpuPercent: z.number(),
  memoryUsedMB: z.number(),
  memoryTotalMB: z.number(),
  diskUsedGB: z.number(),
  diskTotalGB: z.number(),
  timestamp: z.string(),
});

// --- Auth Payload Schema ---
export const AuthPayloadSchema = z.object({
  nodeId: z.string().min(1),
  nodeName: z.string().min(1),
  platform: z.string(),
  arch: z.string(),
  nodeVersion: z.string(),
  connectionType: z.enum(["agent", "mcp"]),
  capabilities: z.array(z.string()),
  token: z.string().min(1),
});

// --- Heartbeat Schema (ADR-16: metrics integrated) ---
export const HeartbeatPayloadSchema = z.object({
  nodeId: z.string().min(1),
  status: z.enum(["online", "offline", "busy"]),
  currentTaskId: z.string().nullable(),
  queueLength: z.number().int().min(0),
  metrics: SystemMetricsSchema,
  timestamp: z.string(),
});

// --- Task Payload Schemas ---
export const PromptPayloadSchema = z.object({
  type: z.literal("prompt"),
  prompt: z.string().min(1),
  cwd: z.string().optional(),
  model: z.string().optional(),
  maxTurns: z.number().int().positive().optional(),
});

export const TaskPayloadSchema = PromptPayloadSchema;

// --- Task Request Schema (ADR-17: intentional redundancy with refine) ---
export const TaskRequestSchema = z
  .object({
    taskId: z.string().min(1),
    sourceNodeId: z.string().min(1),
    targetNodeId: z.string().min(1),
    type: z.literal("prompt"),
    payload: TaskPayloadSchema,
    context: z.string().optional(),
    createdAt: z.string(),
    timeoutMs: z.number().int().positive(),
  })
  .refine((data) => data.type === data.payload.type, {
    message: "TaskRequest.type must match payload.type",
    path: ["type"],
  });

// --- Error Schema ---
export const TaskErrorSchema = z.object({
  code: z.enum([
    "TIMEOUT",
    "CANCELLED",
    "NODE_OFFLINE",
    "QUEUE_FULL",
    "EXECUTION_ERROR",
    "SDK_ERROR",
    "CONNECTION_ERROR",
    "AUTH_FAILED",
    "UNKNOWN",
  ]),
  message: z.string(),
  details: z.unknown().optional(),
});

// --- Task Result Schema ---
export const TaskResultSchema = z.object({
  taskId: z.string().min(1),
  sourceNodeId: z.string().min(1),
  targetNodeId: z.string().min(1),
  success: z.boolean(),
  result: z.string().optional(),
  error: TaskErrorSchema.optional(),
  durationMs: z.number(),
  completedAt: z.string(),
});

// --- Task Progress Schema ---
export const TaskProgressSchema = z.object({
  taskId: z.string().min(1),
  nodeId: z.string().min(1),
  type: z.enum(["partial_result", "status_update"]),
  content: z.string(),
  timestamp: z.string(),
});

// --- Log Entry Schema ---
export const LogEntrySchema = z.object({
  id: z.string().min(1),
  timestamp: z.string(),
  level: z.enum(["info", "warn", "error", "debug"]),
  source: z.string(),
  event: z.string(),
  details: z.string().optional(),
  taskId: z.string().optional(),
});
