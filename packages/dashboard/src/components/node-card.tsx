import type { FC } from "hono/jsx";
import type { NodeInfo } from "@remote-subagent/shared";
import { StatusBadge } from "./status-badge.js";

interface NodeCardProps {
  node: NodeInfo;
  compact?: boolean;
}

function getPlatformIcon(platform: string): string {
  switch (platform) {
    case "darwin":
      return "\uF8FF"; // Apple logo
    case "win32":
      return "\u229E"; // Windows-like
    case "linux":
      return "\u2318"; // Linux-like
    default:
      return "\u25CF";
  }
}

export const NodeCard: FC<NodeCardProps> = ({ node, compact }) => {
  const cpuPercent = node.metrics?.cpuPercent ?? 0;
  const memUsed = node.metrics?.memoryUsedMB ?? 0;
  const memTotal = node.metrics?.memoryTotalMB ?? 1;
  const memPercent = Math.min((memUsed / memTotal) * 100, 100);

  return (
    <div class={`node-card ${node.status}`} data-node-id={node.nodeId}>
      <div class="node-card-header">
        <span class="platform-icon">{getPlatformIcon(node.platform)}</span>
        <div class="node-card-info">
          <h3 class="node-name">{node.nodeName}</h3>
          <span class="node-id">{node.nodeId}</span>
        </div>
        <StatusBadge status={node.status} />
      </div>

      <div class="node-card-metrics">
        <div class="mini-metric">
          <span class="mini-metric-label">CPU</span>
          <div class="mini-bar-track">
            <div
              class="mini-bar-fill"
              style={`width: ${cpuPercent}%`}
              data-metric={`cpu-${node.nodeId}`}
            />
          </div>
          <span class="mini-metric-value" data-value={`cpu-val-${node.nodeId}`}>
            {cpuPercent.toFixed(0)}%
          </span>
        </div>
        <div class="mini-metric">
          <span class="mini-metric-label">RAM</span>
          <div class="mini-bar-track">
            <div
              class="mini-bar-fill"
              style={`width: ${memPercent.toFixed(0)}%`}
              data-metric={`mem-${node.nodeId}`}
            />
          </div>
          <span
            class="mini-metric-value"
            data-value={`mem-val-${node.nodeId}`}
          >
            {memPercent.toFixed(0)}%
          </span>
        </div>
      </div>

      {!compact && (
        <div class="node-card-details">
          <div class="detail-row">
            <span class="detail-label">Platform</span>
            <span class="detail-value">
              {node.platform}/{node.arch}
            </span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Queue</span>
            <span class="detail-value">{node.queueLength} pending</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Task</span>
            <span class="detail-value">
              {node.currentTaskId
                ? node.currentTaskId.slice(0, 8) + "..."
                : "idle"}
            </span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Heartbeat</span>
            <span class="detail-value" data-heartbeat={node.nodeId}>
              {node.lastHeartbeat
                ? node.lastHeartbeat
                : "never"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
