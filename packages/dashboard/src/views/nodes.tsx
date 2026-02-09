import type { FC } from "hono/jsx";
import type { NodeInfo } from "@remote-subagent/shared";
import { StatusBadge } from "../components/status-badge.js";

interface NodesProps {
  nodes: NodeInfo[];
}

export const NodesView: FC<NodesProps> = ({ nodes }) => {
  const onlineCount = nodes.filter((n) => n.status !== "offline").length;
  const runningCount = nodes.filter((n) => n.status === "running").length;

  return (
    <div class="page-nodes">
      <div class="page-header">
        <h2>Nodes</h2>
      </div>

      {/* Summary Bar */}
      <div class="summary-cards">
        <div class="summary-card">
          <div class="summary-value">{nodes.length}</div>
          <div class="summary-label">Total Nodes</div>
        </div>
        <div class="summary-card">
          <div class="summary-value summary-online">{onlineCount}</div>
          <div class="summary-label">Online</div>
        </div>
        <div class="summary-card">
          <div class="summary-value summary-busy">{runningCount}</div>
          <div class="summary-label">Running</div>
        </div>
      </div>

      {/* Node List */}
      <div class="node-list" id="node-list">
        {nodes.length === 0 ? (
          <div class="empty-state">
            <p>No nodes registered.</p>
          </div>
        ) : (
          nodes.map((node) => (
            <div
              class={`node-detail-card ${node.status}`}
              data-node-id={node.nodeId}
            >
              <div class="node-detail-header" onclick="toggleNodeDetail(this)">
                <div class="node-detail-left">
                  <span class={`status-dot ${node.status}`}></span>
                  <div>
                    <h3 class="node-name">{node.nodeName}</h3>
                    <span class="node-id">{node.nodeId}</span>
                  </div>
                </div>
                <div class="node-detail-right">
                  <StatusBadge status={node.status} />
                  <span class="node-platform">
                    {node.platform}/{node.arch}
                  </span>
                  <span class="expand-icon">&#x25BC;</span>
                </div>
              </div>

              <div class="node-detail-body collapsed">
                <div class="detail-grid">
                  <div class="detail-section">
                    <h4>System Metrics</h4>
                    <div class="metrics-display">
                      <div class="metric-row">
                        <span>CPU</span>
                        <div class="metric-bar-track">
                          <div
                            class="metric-bar-fill"
                            style={`width: ${node.metrics?.cpuPercent ?? 0}%`}
                          />
                        </div>
                        <span>{(node.metrics?.cpuPercent ?? 0).toFixed(1)}%</span>
                      </div>
                      <div class="metric-row">
                        <span>Memory</span>
                        <div class="metric-bar-track">
                          <div
                            class="metric-bar-fill"
                            style={`width: ${node.metrics ? ((node.metrics.memoryUsedMB / node.metrics.memoryTotalMB) * 100).toFixed(0) : 0}%`}
                          />
                        </div>
                        <span>
                          {(node.metrics?.memoryUsedMB ?? 0).toFixed(0)}/
                          {(node.metrics?.memoryTotalMB ?? 0).toFixed(0)} MB
                        </span>
                      </div>
                      <div class="metric-row">
                        <span>Disk</span>
                        <div class="metric-bar-track">
                          <div
                            class="metric-bar-fill"
                            style={`width: ${node.metrics ? ((node.metrics.diskUsedGB / node.metrics.diskTotalGB) * 100).toFixed(0) : 0}%`}
                          />
                        </div>
                        <span>
                          {(node.metrics?.diskUsedGB ?? 0).toFixed(1)}/
                          {(node.metrics?.diskTotalGB ?? 0).toFixed(1)} GB
                        </span>
                      </div>
                    </div>
                  </div>

                  <div class="detail-section">
                    <h4>Connection Info</h4>
                    <div class="info-rows">
                      <div class="info-row">
                        <span class="info-label">Node Version</span>
                        <span class="info-value">{node.nodeVersion}</span>
                      </div>
                      <div class="info-row">
                        <span class="info-label">Connected At</span>
                        <span class="info-value">
                          {new Date(node.connectedAt).toLocaleString()}
                        </span>
                      </div>
                      <div class="info-row">
                        <span class="info-label">Last Heartbeat</span>
                        <span class="info-value">
                          {new Date(node.lastHeartbeat).toLocaleString()}
                        </span>
                      </div>
                      <div class="info-row">
                        <span class="info-label">Capabilities</span>
                        <span class="info-value">
                          {node.capabilities.join(", ")}
                        </span>
                      </div>
                      <div class="info-row">
                        <span class="info-label">Queue Length</span>
                        <span class="info-value">{node.queueLength}</span>
                      </div>
                      <div class="info-row">
                        <span class="info-label">Current Task</span>
                        <span class="info-value">
                          {node.currentTaskId || "None"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="node-actions">
                  <a
                    href={`/console?target=${node.nodeId}`}
                    class="btn btn-primary"
                  >
                    Send Task
                  </a>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
