import type { FC } from "hono/jsx";
import type { NodeInfo } from "@remote-subagent/shared";

interface ConsoleProps {
  nodes: NodeInfo[];
  selectedTarget?: string;
}

export const ConsoleView: FC<ConsoleProps> = ({ nodes, selectedTarget }) => {
  return (
    <div class="page-console">
      <div class="page-header">
        <h2>Command Console</h2>
      </div>

      <div class="console-layout">
        {/* Left Panel - Command Input & Results */}
        <div class="console-main">
          {/* Target Selection */}
          <div class="console-target">
            <label>Target Node</label>
            <select id="console-target">
              <option value="all">All Nodes</option>
              {nodes.map((node) => (
                <option
                  value={node.nodeId}
                  selected={selectedTarget === node.nodeId}
                  disabled={node.status === "offline"}
                >
                  {node.status === "offline" ? "\u25CB" : "\u25CF"}{" "}
                  {node.nodeName} ({node.nodeId})
                  {node.status === "offline" ? " [offline]" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Input Areas */}
          <div class="console-input-area">
            <textarea
              id="input-prompt"
              class="console-textarea"
              rows={6}
              placeholder="Enter prompt for remote Claude..."
            />

            <div id="cwd-group" class="input-group">
              <label>Working Directory (optional)</label>
              <input
                type="text"
                id="input-cwd"
                class="console-input"
                placeholder="/path/on/target/machine"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div class="console-actions">
            <button class="btn btn-primary" onclick="executeCommand()" id="btn-execute">
              Execute
            </button>
            <button class="btn btn-secondary" onclick="clearConsole()">
              Clear
            </button>
            <span class="hint">Ctrl+Enter to execute</span>
          </div>

          {/* Results */}
          <div class="console-results" id="console-results">
            <div class="empty-state text-muted">
              Results will appear here after execution.
            </div>
          </div>
        </div>

        {/* Right Panel - Command History */}
        <div class="console-sidebar">
          <h3>
            Command History (<span id="history-count">0</span>)
          </h3>
          <div class="history-list" id="history-list">
            <div class="empty-state text-muted">No commands yet.</div>
          </div>
        </div>
      </div>
    </div>
  );
};
