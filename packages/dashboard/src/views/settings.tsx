import type { FC } from "hono/jsx";
import {
  LOG_BUFFER_SIZE,
  MAX_QUEUE_SIZE,
  DEFAULT_TASK_TIMEOUT_MS,
  SOCKET_MAX_BUFFER_SIZE,
} from "@remote-subagent/shared";

interface SettingsProps {
  metrics: {
    uptimeMs: number;
    version: string;
  };
  masterUrl: string;
  masterPort: string;
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

export const SettingsView: FC<SettingsProps> = ({
  metrics,
  masterUrl,
  masterPort,
}) => {
  return (
    <div class="page-settings">
      <div class="page-header">
        <h2>Settings</h2>
      </div>

      {/* Master Info */}
      <div class="settings-section">
        <h3>Master Server</h3>
        <div class="settings-card">
          <div class="settings-row">
            <span class="settings-label">URL</span>
            <span class="settings-value">{masterUrl}</span>
          </div>
          <div class="settings-row">
            <span class="settings-label">Port</span>
            <span class="settings-value">{masterPort}</span>
          </div>
          <div class="settings-row">
            <span class="settings-label">Version</span>
            <span class="settings-value">{metrics.version}</span>
          </div>
          <div class="settings-row">
            <span class="settings-label">Uptime</span>
            <span class="settings-value">{formatUptime(metrics.uptimeMs)}</span>
          </div>
        </div>
      </div>

      {/* Token Generation */}
      <div class="settings-section">
        <h3>Connection Tokens</h3>
        <div class="settings-card">
          <p class="text-muted">
            Generate JWT tokens for node agents and MCP servers to connect to
            the master.
          </p>
          <div class="token-form">
            <div class="input-group">
              <label>Node ID</label>
              <input
                type="text"
                id="token-node-id"
                class="console-input"
                placeholder="e.g., macbook-pro"
              />
            </div>
            <button
              class="btn btn-primary"
              onclick="generateToken()"
            >
              Generate Token
            </button>
          </div>
          <div id="token-result" class="token-result" style="display: none;">
            <label>Generated Token:</label>
            <textarea id="token-value" class="console-textarea" rows={3} readonly />
            <button class="btn btn-secondary" onclick="copyToken()">
              Copy to Clipboard
            </button>
          </div>
        </div>
      </div>

      {/* Auth Settings */}
      <div class="settings-section">
        <h3>Dashboard Authentication</h3>
        <div class="settings-card">
          <div class="settings-row">
            <span class="settings-label">Method</span>
            <span class="settings-value">Basic Auth</span>
          </div>
          <p class="text-muted">
            Password changes require updating the DASHBOARD_PASSWORD environment
            variable and restarting the dashboard process.
          </p>
        </div>
      </div>

      {/* System Constants */}
      <div class="settings-section">
        <h3>System Configuration</h3>
        <div class="settings-card">
          <div class="settings-row">
            <span class="settings-label">Log Buffer Size</span>
            <span class="settings-value">
              {LOG_BUFFER_SIZE.toLocaleString()} entries
            </span>
          </div>
          <div class="settings-row">
            <span class="settings-label">Max Queue Size</span>
            <span class="settings-value">{MAX_QUEUE_SIZE} per node</span>
          </div>
          <div class="settings-row">
            <span class="settings-label">Default Task Timeout</span>
            <span class="settings-value">
              {DEFAULT_TASK_TIMEOUT_MS / 1000}s
            </span>
          </div>
          <div class="settings-row">
            <span class="settings-label">Socket Buffer Size</span>
            <span class="settings-value">
              {SOCKET_MAX_BUFFER_SIZE / 1024 / 1024}MB
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
