export interface AgentConfig {
  nodeId: string;
  nodeName: string;
  masterUrl: string;
  token: string;
  claudeModel: string;
  // Security
  allowedPaths: string[];
  deniedCommands: string[];
  // Platform
  defaultShell: string;
  // Task
  maxQueueSize: number;
  maxTaskTimeoutMs: number;
}

export function loadConfig(): AgentConfig {
  const platform = process.platform;
  const defaultShell =
    platform === "win32"
      ? process.env.DEFAULT_SHELL || "cmd.exe"
      : process.env.DEFAULT_SHELL || "/bin/bash";

  return {
    nodeId: process.env.NODE_ID || `node-${process.platform}-${Date.now()}`,
    nodeName: process.env.NODE_NAME || `${process.platform} node`,
    masterUrl: process.env.MASTER_URL || "http://localhost:3100",
    token: process.env.NODE_TOKEN || "",
    claudeModel:
      process.env.CLAUDE_MODEL || "claude-sonnet-4-5-20250929",
    allowedPaths: process.env.ALLOWED_PATHS
      ? process.env.ALLOWED_PATHS.split(",").map((p) => p.trim())
      : [],
    deniedCommands: process.env.DENIED_COMMANDS
      ? process.env.DENIED_COMMANDS.split(",").map((c) => c.trim())
      : ["rm -rf /", "shutdown", "reboot", "mkfs"],
    defaultShell,
    maxQueueSize: parseInt(process.env.MAX_QUEUE_SIZE || "10", 10),
    maxTaskTimeoutMs: parseInt(
      process.env.MAX_TASK_TIMEOUT_MS || "300000",
      10,
    ),
  };
}
