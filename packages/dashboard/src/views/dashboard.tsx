import type { FC } from "hono/jsx";
import type { NodeInfo } from "@remote-subagent/shared";
import { NodeCard } from "../components/node-card.js";

interface DashboardProps {
  nodes: NodeInfo[];
  metrics: {
    totalNodes: number;
    onlineNodes: number;
    activeTasks: number;
    todayTaskCount: number;
    uptimeMs: number;
  };
}

export const DashboardView: FC<DashboardProps> = ({ nodes, metrics }) => {
  return (
    <div class="page-dashboard">
      <div class="page-header">
        <h2>Dashboard Overview</h2>
      </div>

      {/* Summary Cards */}
      <div class="summary-cards" id="summary-cards">
        <div class="summary-card">
          <div class="summary-value" id="stat-total">{metrics.totalNodes}</div>
          <div class="summary-label">Total Nodes</div>
        </div>
        <div class="summary-card">
          <div class="summary-value summary-online" id="stat-online">
            {metrics.onlineNodes}
          </div>
          <div class="summary-label">Online</div>
        </div>
        <div class="summary-card">
          <div class="summary-value summary-busy" id="stat-tasks">
            {metrics.activeTasks}
          </div>
          <div class="summary-label">Active Tasks</div>
        </div>
        <div class="summary-card">
          <div class="summary-value" id="stat-today">
            {metrics.todayTaskCount}
          </div>
          <div class="summary-label">Tasks Today</div>
        </div>
      </div>

      {/* Node Grid */}
      <div class="section">
        <h3 class="section-title">Connected Nodes</h3>
        <div class="node-grid" id="node-grid">
          {nodes.length === 0 ? (
            <div class="empty-state">
              <p>No nodes connected yet.</p>
              <p class="text-muted">
                Start a node agent to see it appear here.
              </p>
            </div>
          ) : (
            nodes.map((node) => <NodeCard node={node} />)
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div class="section">
        <h3 class="section-title">
          Recent Activity
          <span class="live-indicator">
            <span class="live-dot"></span> Live
          </span>
        </h3>
        <div class="activity-feed" id="activity-feed">
          <div class="empty-state text-muted">
            Waiting for events...
          </div>
        </div>
      </div>
    </div>
  );
};
