/** Client → Server events */
export const C2S = {
  AUTHENTICATE: "authenticate",
  HEARTBEAT: "heartbeat",
  TASK_RESULT: "task:result",
  TASK_REQUEST: "task:request",
  TASK_CANCEL: "task:cancel",
  TASK_PROGRESS: "task:progress",
  LIST_NODES: "list:nodes",
  LIST_SESSIONS: "list:sessions",
  DELETE_SESSION: "delete:session",
} as const;

/** Server → Client events (default namespace, for node-agent/mcp-server) */
export const S2C = {
  AUTH_RESULT: "auth:result",
  TASK_ASSIGN: "task:assign",
  TASK_RESPONSE: "task:response",
  TASK_CANCEL: "task:cancel",
  TASK_PROGRESS: "task:progress",
  NODES_LIST: "nodes:list",
  ERROR: "error:message",
} as const;

/** Dashboard namespace (/dashboard) - Browser → Master (C2S) */
export const DASHBOARD_C2S = {
  SUBSCRIBE: "dashboard:subscribe",
} as const;

/** Dashboard namespace (/dashboard) - Master → Browser (S2C) */
export const DASHBOARD_S2C = {
  LOG_ENTRY: "dashboard:log",
  NODES_UPDATE: "dashboard:nodes_update",
  TASK_UPDATE: "dashboard:task_update",
  METRICS_UPDATE: "dashboard:metrics_update",
  TASK_PROGRESS: "dashboard:task_progress",
} as const;
