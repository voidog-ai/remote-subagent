// ========================================
// RemoteSubagent Dashboard Client
// Socket.IO + HTMX Integration
// ========================================

/* global io */

(function () {
  "use strict";

  // --- Configuration ---
  const masterUrl = window.__MASTER_URL__;
  const dashboardSecret = window.__DASHBOARD_SECRET__;
  let autoScroll = true;

  const commandHistory = [];

  // --- Socket.IO Connection (ADR-15: /dashboard namespace) ---
  let socket = null;

  function connectSocket() {
    if (masterUrl === undefined || masterUrl === null || !dashboardSecret) {
      console.warn("Missing master URL or dashboard secret");
      return;
    }

    socket = io(masterUrl + "/dashboard", {
      auth: { secret: dashboardSecret },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
    });

    socket.on("connect", () => {
      updateConnectionStatus(true);
      socket.emit("dashboard:subscribe");
    });

    socket.on("disconnect", () => {
      updateConnectionStatus(false);
    });

    socket.on("connect_error", (err) => {
      console.error("Dashboard socket error:", err.message);
      updateConnectionStatus(false);
    });

    // --- Event Handlers ---

    // Nodes update
    socket.on("dashboard:nodes_update", (nodes) => {
      updateNodeGrid(nodes);
      updateSummaryStats(nodes);
      updateConsoleTargets(nodes);
    });

    // Log entry
    socket.on("dashboard:log", (entry) => {
      appendLogEntry(entry);
      appendActivityItem(entry);
    });

    // Metrics update
    socket.on("dashboard:metrics_update", (data) => {
      updateNodeMetrics(data.nodeId, data.metrics);
    });

    // Task update (results)
    socket.on("dashboard:task_update", (result) => {
      handleTaskResult(result);
    });

    // Task progress
    socket.on("dashboard:task_progress", (progress) => {
      handleTaskProgress(progress);
    });
  }

  // --- Connection Status ---
  function updateConnectionStatus(connected) {
    const el = document.getElementById("connection-status");
    if (!el) return;
    const dot = el.querySelector(".status-dot");
    const text = el.querySelector(".status-text");
    if (dot) {
      dot.className = "status-dot " + (connected ? "connected" : "disconnected");
    }
    if (text) {
      text.textContent = connected ? "Connected" : "Disconnected";
    }
  }

  // --- Node Grid Updates ---
  function updateNodeGrid(nodes) {
    const grid = document.getElementById("node-grid");
    if (!grid) return;

    if (nodes.length === 0) {
      grid.innerHTML =
        '<div class="empty-state"><p>No nodes connected yet.</p></div>';
      return;
    }

    grid.innerHTML = nodes
      .map(
        (n) => `
      <div class="node-card ${n.status}" data-node-id="${n.nodeId}">
        <div class="node-card-header">
          <span class="platform-icon">${getPlatformIcon(n.platform)}</span>
          <div class="node-card-info">
            <h3 class="node-name">${esc(n.nodeName)}</h3>
            <span class="node-id">${esc(n.nodeId)}</span>
          </div>
          <span class="badge badge-${n.status}">${n.status}</span>
        </div>
        <div class="node-card-metrics">
          <div class="mini-metric">
            <span class="mini-metric-label">CPU</span>
            <div class="mini-bar-track"><div class="mini-bar-fill" style="width:${n.metrics?.cpuPercent ?? 0}%"></div></div>
            <span class="mini-metric-value">${(n.metrics?.cpuPercent ?? 0).toFixed(0)}%</span>
          </div>
          <div class="mini-metric">
            <span class="mini-metric-label">RAM</span>
            <div class="mini-bar-track"><div class="mini-bar-fill" style="width:${n.metrics ? ((n.metrics.memoryUsedMB / n.metrics.memoryTotalMB) * 100).toFixed(0) : 0}%"></div></div>
            <span class="mini-metric-value">${n.metrics ? ((n.metrics.memoryUsedMB / n.metrics.memoryTotalMB) * 100).toFixed(0) : 0}%</span>
          </div>
        </div>
        <div class="node-card-details">
          <div class="detail-row"><span class="detail-label">Platform</span><span class="detail-value">${n.platform}/${n.arch}</span></div>
          <div class="detail-row"><span class="detail-label">Queue</span><span class="detail-value">${n.queueLength} pending</span></div>
          <div class="detail-row"><span class="detail-label">Task</span><span class="detail-value">${n.currentTaskId ? n.currentTaskId.slice(0, 8) + "..." : "idle"}</span></div>
        </div>
      </div>
    `,
      )
      .join("");
  }

  function updateSummaryStats(nodes) {
    const total = document.getElementById("stat-total");
    const online = document.getElementById("stat-online");
    if (total) total.textContent = nodes.length;
    if (online) online.textContent = nodes.filter((n) => n.status !== "offline").length;
  }

  function updateNodeMetrics(nodeId, metrics) {
    // Update mini bars on node cards
    const card = document.querySelector(`[data-node-id="${nodeId}"]`);
    if (!card) return;

    const bars = card.querySelectorAll(".mini-bar-fill");
    const values = card.querySelectorAll(".mini-metric-value");
    if (bars[0]) bars[0].style.width = metrics.cpuPercent + "%";
    if (bars[1] && metrics.memoryTotalMB > 0) {
      bars[1].style.width = ((metrics.memoryUsedMB / metrics.memoryTotalMB) * 100).toFixed(0) + "%";
    }
    if (values[0]) values[0].textContent = metrics.cpuPercent.toFixed(0) + "%";
    if (values[1] && metrics.memoryTotalMB > 0) {
      values[1].textContent = ((metrics.memoryUsedMB / metrics.memoryTotalMB) * 100).toFixed(0) + "%";
    }
  }

  // --- Log Stream ---
  function appendLogEntry(entry) {
    const stream = document.getElementById("log-stream");
    if (!stream) return;

    // Remove empty state
    const empty = stream.querySelector(".log-empty");
    if (empty) empty.remove();

    const div = document.createElement("div");
    div.className = `log-entry log-${entry.level}`;
    div.innerHTML = `
      <span class="log-timestamp">${formatTs(entry.timestamp)}</span>
      <span class="log-level log-level-${entry.level}">${entry.level.toUpperCase().padEnd(5)}</span>
      <span class="log-source">[${esc(entry.source)}]</span>
      <span class="log-event">${esc(entry.event)}</span>
      ${entry.details ? `<span class="log-details">${esc(entry.details)}</span>` : ""}
      ${entry.taskId ? `<span class="log-task-id">[${entry.taskId.slice(0, 8)}]</span>` : ""}
    `;
    stream.appendChild(div);

    // Keep max 500 entries
    while (stream.children.length > 500) {
      stream.removeChild(stream.firstChild);
    }

    if (autoScroll) {
      stream.scrollTop = stream.scrollHeight;
    }

    // Update counters
    updateLogCounters();
  }

  function updateLogCounters() {
    const stream = document.getElementById("log-stream");
    if (!stream) return;

    const entries = stream.querySelectorAll(".log-entry");
    const errors = stream.querySelectorAll(".log-error").length;
    const warns = stream.querySelectorAll(".log-warn").length;

    const countEl = document.getElementById("log-count");
    const errorEl = document.getElementById("error-count");
    const warnEl = document.getElementById("warn-count");
    if (countEl) countEl.textContent = entries.length;
    if (errorEl) errorEl.textContent = errors;
    if (warnEl) warnEl.textContent = warns;
  }

  // --- Activity Feed ---
  function appendActivityItem(entry) {
    const feed = document.getElementById("activity-feed");
    if (!feed) return;

    // Remove empty state
    const empty = feed.querySelector(".empty-state");
    if (empty) empty.remove();

    const dotClass =
      entry.level === "error"
        ? "error"
        : entry.level === "warn"
          ? "warning"
          : entry.event.includes("completed")
            ? "success"
            : "info";

    const div = document.createElement("div");
    div.className = "activity-item";
    div.innerHTML = `
      <span class="activity-dot ${dotClass}"></span>
      <span class="activity-time">${formatTs(entry.timestamp)}</span>
      <span class="activity-text">${esc(entry.event)}</span>
    `;

    feed.insertBefore(div, feed.firstChild);

    // Keep max 50 items
    while (feed.children.length > 50) {
      feed.removeChild(feed.lastChild);
    }
  }

  // --- Console ---
  let pendingTaskIds = new Set();

  function updateConsoleTargets(nodes) {
    const select = document.getElementById("console-target");
    if (!select) return;

    const currentValue = select.value;
    const options = ['<option value="all">All Nodes</option>'];
    nodes.forEach((n) => {
      const disabled = n.status === "offline" ? "disabled" : "";
      const icon = n.status === "offline" ? "\u25CB" : "\u25CF";
      const suffix = n.status === "offline" ? " [offline]" : "";
      options.push(
        `<option value="${n.nodeId}" ${disabled}>${icon} ${esc(n.nodeName)} (${esc(n.nodeId)})${suffix}</option>`,
      );
    });
    select.innerHTML = options.join("");
    if (currentValue) select.value = currentValue;
  }

  window.executeCommand = function () {
    const target = document.getElementById("console-target")?.value;
    if (!target) return;

    const prompt = document.getElementById("input-prompt")?.value?.trim();
    if (!prompt) return;

    const type = "prompt";
    const payload = { type: "prompt", prompt };

    // Show spinner
    const results = document.getElementById("console-results");
    if (results) {
      results.innerHTML = '<div class="result-spinner"><div class="spinner"></div> Executing...</div>';
    }

    // Disable execute button
    const btn = document.getElementById("btn-execute");
    if (btn) btn.disabled = true;

    // Send to API
    fetch("/api/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetNodeId: target,
        type,
        payload,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.taskId) {
          pendingTaskIds.add(data.taskId);
        }
        if (data.taskIds) {
          data.taskIds.forEach((id) => pendingTaskIds.add(id));
        }

        // Add to history
        const historyItem = {
          target,
          type,
          payload,
          taskId: data.taskId || data.taskIds?.[0],
          timestamp: new Date().toISOString(),
          status: "pending",
        };
        commandHistory.unshift(historyItem);
        updateHistoryList();
      })
      .catch((err) => {
        if (results) {
          results.innerHTML = `<div class="result-body error">Error: ${esc(err.message)}</div>`;
        }
        if (btn) btn.disabled = false;
      });
  };

  function handleTaskResult(result) {
    if (!pendingTaskIds.has(result.taskId)) return;
    pendingTaskIds.delete(result.taskId);

    const results = document.getElementById("console-results");
    if (results) {
      const statusBadge = result.success
        ? '<span class="badge badge-online">success</span>'
        : '<span class="badge badge-offline">failed</span>';

      const body = result.success
        ? `<div class="result-body">${esc(result.result || "")}</div>`
        : `<div class="result-body error">${esc(result.error?.code || "ERROR")}: ${esc(result.error?.message || "Unknown error")}</div>`;

      const html = `
        <div class="result-header">
          <span class="result-source">${esc(result.targetNodeId)}</span>
          ${statusBadge}
          <span class="result-time">${result.durationMs}ms</span>
          <button class="btn btn-secondary" onclick="copyResult(this)" style="margin-left:auto;padding:4px 8px;font-size:11px;">Copy</button>
        </div>
        ${body}
      `;

      const isSpinner = results.innerHTML.includes("result-spinner");
      if (isSpinner) {
        results.innerHTML = html;
      } else {
        results.innerHTML += "<hr style='border-color:var(--border);margin:12px 0'>" + html;
      }
    }

    // Update history
    const item = commandHistory.find((h) => h.taskId === result.taskId);
    if (item) {
      item.status = result.success ? "success" : "error";
      item.durationMs = result.durationMs;
      updateHistoryList();
    }

    // Re-enable button if no more pending
    if (pendingTaskIds.size === 0) {
      const btn = document.getElementById("btn-execute");
      if (btn) btn.disabled = false;
    }
  }

  function handleTaskProgress(progress) {
    // Keep spinner visible until final result arrives
  }

  function updateHistoryList() {
    const list = document.getElementById("history-list");
    const count = document.getElementById("history-count");
    if (!list) return;
    if (count) count.textContent = commandHistory.length;

    if (commandHistory.length === 0) {
      list.innerHTML = '<div class="empty-state text-muted">No commands yet.</div>';
      return;
    }

    list.innerHTML = commandHistory
      .slice(0, 50)
      .map(
        (h) => `
      <div class="history-item" onclick='restoreCommand(${JSON.stringify(h).replace(/'/g, "&#39;")})'>
        <span class="history-icon ${h.status}">${h.status === "success" ? "\u2713" : h.status === "error" ? "\u2717" : "\u25CF"}</span>
        <div class="history-info">
          <div class="history-target">${esc(h.target)}</div>
          <div class="history-command">${esc(getCommandPreview(h))}</div>
        </div>
        <div class="history-meta">
          <span class="history-type-badge">prompt</span>
          ${h.durationMs ? `<span>${h.durationMs}ms</span>` : ""}
        </div>
      </div>
    `,
      )
      .join("");
  }

  function getCommandPreview(h) {
    return (h.payload.prompt || "").slice(0, 50);
  }

  window.restoreCommand = function (h) {
    const targetEl = document.getElementById("console-target");
    if (targetEl) targetEl.value = h.target;

    const el = document.getElementById("input-prompt");
    if (el) el.value = h.payload.prompt || "";
  };

  window.clearConsole = function () {
    const results = document.getElementById("console-results");
    if (results) {
      results.innerHTML = '<div class="empty-state text-muted">Results will appear here after execution.</div>';
    }
  };

  window.copyResult = function (btn) {
    const resultBody = btn.closest(".console-results")?.querySelector(".result-body");
    if (resultBody) {
      navigator.clipboard.writeText(resultBody.textContent);
      btn.textContent = "Copied!";
      setTimeout(() => (btn.textContent = "Copy"), 2000);
    }
  };

  // --- Logs Page ---
  window.filterLogs = function () {
    const level = document.getElementById("log-filter-level")?.value || "";
    const source = document.getElementById("log-filter-source")?.value || "";
    const search = (document.getElementById("log-filter-search")?.value || "").toLowerCase();
    const stream = document.getElementById("log-stream");
    if (!stream) return;

    const entries = stream.querySelectorAll(".log-entry");
    entries.forEach((entry) => {
      let show = true;
      if (level && !entry.classList.contains("log-" + level)) show = false;
      if (source) {
        const src = entry.querySelector(".log-source")?.textContent || "";
        if (!src.includes(source)) show = false;
      }
      if (search) {
        if (!entry.textContent.toLowerCase().includes(search)) show = false;
      }
      entry.style.display = show ? "" : "none";
    });
  };

  window.toggleAutoScroll = function () {
    autoScroll = document.getElementById("log-autoscroll")?.checked ?? true;
  };

  window.clearLogs = function () {
    const stream = document.getElementById("log-stream");
    if (stream) {
      stream.innerHTML = '<div class="log-empty">Waiting for logs...</div>';
    }
    updateLogCounters();
  };

  window.exportLogs = function () {
    const stream = document.getElementById("log-stream");
    if (!stream) return;

    const entries = stream.querySelectorAll(".log-entry");
    let csv = "Timestamp,Level,Source,Event,Details,TaskId\n";
    entries.forEach((entry) => {
      const timestamp = entry.querySelector(".log-timestamp")?.textContent || "";
      const level = entry.querySelector(".log-level")?.textContent?.trim() || "";
      const source = entry.querySelector(".log-source")?.textContent || "";
      const event = entry.querySelector(".log-event")?.textContent || "";
      const details = entry.querySelector(".log-details")?.textContent || "";
      const taskId = entry.querySelector(".log-task-id")?.textContent || "";
      csv += `"${timestamp}","${level}","${source}","${event}","${details}","${taskId}"\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- Nodes Page ---
  window.toggleNodeDetail = function (header) {
    const body = header.nextElementSibling;
    const icon = header.querySelector(".expand-icon");
    if (body) {
      body.classList.toggle("collapsed");
      if (icon) {
        icon.style.transform = body.classList.contains("collapsed") ? "" : "rotate(180deg)";
      }
    }
  };

  // --- Settings Page ---
  window.generateToken = function () {
    const nodeId = document.getElementById("token-node-id")?.value?.trim();
    if (!nodeId) {
      alert("Please enter a Node ID");
      return;
    }

    fetch("/api/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId }),
    })
      .then((res) => res.json())
      .then((data) => {
        const result = document.getElementById("token-result");
        const value = document.getElementById("token-value");
        if (result && value) {
          value.value = data.token;
          result.style.display = "block";
        }
      })
      .catch((err) => alert("Error: " + err.message));
  };

  window.copyToken = function () {
    const value = document.getElementById("token-value");
    if (value) {
      navigator.clipboard.writeText(value.value);
    }
  };

  // --- Keyboard Shortcuts ---
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key === "Enter") {
      e.preventDefault();
      window.executeCommand();
    }
  });

  // --- Helpers ---
  function formatTs(isoString) {
    return new Date(isoString).toLocaleTimeString("en-GB", { hour12: false });
  }

  function reformatServerTimestamps() {
    document.querySelectorAll("[data-ts]").forEach((el) => {
      el.textContent = formatTs(el.dataset.ts);
    });
  }

  function getPlatformIcon(platform) {
    switch (platform) {
      case "darwin": return "\uF8FF";
      case "win32": return "\u229E";
      case "linux": return "\u2318";
      default: return "\u25CF";
    }
  }

  function esc(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Initialize ---
  reformatServerTimestamps();
  connectSocket();
})();
