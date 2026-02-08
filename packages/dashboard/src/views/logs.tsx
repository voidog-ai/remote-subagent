import type { FC } from "hono/jsx";
import type { LogEntry } from "@remote-subagent/shared";

interface LogsProps {
  logs: LogEntry[];
  sources: string[];
}

export const LogsView: FC<LogsProps> = ({ logs, sources }) => {
  const errorCount = logs.filter((l) => l.level === "error").length;
  const warnCount = logs.filter((l) => l.level === "warn").length;

  return (
    <div class="page-logs">
      <div class="page-header">
        <h2>Communication Logs</h2>
        <div class="header-actions">
          <span class="live-indicator">
            <span class="live-dot"></span> Live
          </span>
        </div>
      </div>

      {/* Filter Bar */}
      <div class="filter-bar">
        <div class="filter-group">
          <label>Level</label>
          <select id="log-filter-level" onchange="filterLogs()">
            <option value="">ALL</option>
            <option value="info">INFO</option>
            <option value="warn">WARN</option>
            <option value="error">ERROR</option>
            <option value="debug">DEBUG</option>
          </select>
        </div>
        <div class="filter-group">
          <label>Source</label>
          <select id="log-filter-source" onchange="filterLogs()">
            <option value="">All</option>
            {sources.map((s) => (
              <option value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div class="filter-group">
          <label>Search</label>
          <input
            type="text"
            id="log-filter-search"
            placeholder="Search logs..."
            oninput="filterLogs()"
          />
        </div>
        <div class="filter-actions">
          <label class="toggle-label">
            <input
              type="checkbox"
              id="log-autoscroll"
              checked
              onchange="toggleAutoScroll()"
            />
            Auto-scroll
          </label>
          <button class="btn btn-secondary" onclick="clearLogs()">
            Clear
          </button>
          <button class="btn btn-secondary" onclick="exportLogs()">
            Export CSV
          </button>
        </div>
      </div>

      {/* Log Stream */}
      <div class="log-stream" id="log-stream">
        {logs.length === 0 ? (
          <div class="log-empty">Waiting for logs...</div>
        ) : (
          logs.slice(-500).map((entry) => (
            <div class={`log-entry log-${entry.level}`}>
              <span class="log-timestamp" data-ts={entry.timestamp}>
                {entry.timestamp}
              </span>
              <span class={`log-level log-level-${entry.level}`}>
                {entry.level.toUpperCase().padEnd(5)}
              </span>
              <span class="log-source">[{entry.source}]</span>
              <span class="log-event">{entry.event}</span>
              {entry.details && (
                <span class="log-details">{entry.details}</span>
              )}
              {entry.taskId && (
                <span class="log-task-id">[{entry.taskId.slice(0, 8)}]</span>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div class="log-footer">
        <span>
          Total: <strong id="log-count">{logs.length}</strong>
        </span>
        <span>
          Errors: <strong class="text-error" id="error-count">{errorCount}</strong>
        </span>
        <span>
          Warnings:{" "}
          <strong class="text-warn" id="warn-count">{warnCount}</strong>
        </span>
      </div>
    </div>
  );
};
