export interface AgentConfig {
  nodeId: string;
  nodeName: string;
  masterUrl: string;
  token: string;
  claudeModel: string;
  // Claude
  claudePath: string;
  // Task
  maxQueueSize: number;
  maxTaskTimeoutMs: number;
  // Session
  sessionPersistence: boolean;
}

export function loadConfig(): AgentConfig {
  return {
    nodeId: process.env.NODE_ID || `node-${process.platform}-${Date.now()}`,
    nodeName: process.env.NODE_NAME || `${process.platform} node`,
    masterUrl: process.env.MASTER_URL || "http://localhost:3100",
    token: process.env.NODE_TOKEN || "",
    claudeModel:
      process.env.CLAUDE_MODEL || "claude-sonnet-4-5-20250929",
    claudePath: process.env.CLAUDE_PATH || "claude",
    maxQueueSize: parseInt(process.env.MAX_QUEUE_SIZE || "10", 10),
    maxTaskTimeoutMs: parseInt(
      process.env.MAX_TASK_TIMEOUT_MS || "300000",
      10,
    ),
    sessionPersistence: process.env.SESSION_PERSISTENCE !== "false",
  };
}
