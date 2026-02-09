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
      if (window.__graphEngine) window.__graphEngine.updateNodes(nodes);
    });

    // Log entry
    socket.on("dashboard:log", (entry) => {
      appendLogEntry(entry);
      appendActivityItem(entry);
    });

    // Metrics update
    socket.on("dashboard:metrics_update", (data) => {
      updateNodeMetrics(data.nodeId, data.metrics);
      if (window.__graphEngine) window.__graphEngine.updateMetrics(data.nodeId, data.metrics);
    });

    // Task update (results)
    socket.on("dashboard:task_update", (result) => {
      handleTaskResult(result);
      if (window.__graphEngine) window.__graphEngine.handleTaskComplete(result);
    });

    // Task progress
    socket.on("dashboard:task_progress", (progress) => {
      handleTaskProgress(progress);
      if (window.__graphEngine) window.__graphEngine.handleTaskProgress(progress);
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

  // --- Chat Console ---
  var knownNodeNames = {}; // nodeId -> nodeName cache
  var pendingTaskIds = new Map(); // taskId -> typingElementId (for locally-initiated tasks)
  var renderedTaskIds = new Set(); // track which taskIds are already shown

  function updateConsoleTargets(nodes) {
    var select = document.getElementById("console-target");
    if (!select) return;

    var currentValue = select.value;
    var options = ['<option value="all">All Nodes</option>'];
    nodes.forEach(function (n) {
      // Cache node names for chat display
      knownNodeNames[n.nodeId] = n.nodeName;
      var disabled = n.status === "offline" ? "disabled" : "";
      var icon = n.status === "offline" ? "\u25CB" : "\u25CF";
      var suffix = n.status === "offline" ? " [offline]" : "";
      options.push(
        '<option value="' + esc(n.nodeId) + '" ' + disabled + '>' + icon + ' ' + esc(n.nodeName) + suffix + '</option>',
      );
    });
    select.innerHTML = options.join("");
    if (currentValue) select.value = currentValue;

    // Update member count
    var countEl = document.getElementById("chat-member-count");
    if (countEl) {
      var onlineCount = nodes.filter(function (n) { return n.status !== "offline"; }).length;
      countEl.textContent = onlineCount + " online";
    }
  }

  function initChat() {
    var chatInput = document.getElementById("chat-input");
    if (!chatInput) return;

    // Auto-resize textarea
    chatInput.addEventListener("input", function () {
      this.style.height = "auto";
      this.style.height = Math.min(this.scrollHeight, 120) + "px";
    });

    // Shift+Enter to send (Enter = newline, avoids IME composition issues)
    chatInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && e.shiftKey && !e.isComposing) {
        e.preventDefault();
        window.sendChatMessage();
      }
    });

    // Load chat history from API
    loadChatHistory();
  }

  function loadChatHistory() {
    var container = document.getElementById("chat-messages");
    var loadingEl = document.getElementById("chat-loading");
    if (!container) return;

    // Fetch completed task history and active tasks in parallel
    Promise.all([
      fetch("/api/tasks").then(function (r) { return r.json(); }),
      fetch("/api/tasks?active=true").then(function (r) { return r.json(); }),
    ])
      .then(function (results) {
        var history = results[0] || [];
        var active = results[1] || [];

        // Remove loading indicator
        if (loadingEl) loadingEl.remove();

        // Render completed tasks from history
        // history items: { taskId, sourceNodeId, targetNodeId, success, result?, error?, durationMs, completedAt, prompt?, createdAt? }
        history.forEach(function (entry) {
          if (renderedTaskIds.has(entry.taskId)) return;
          renderedTaskIds.add(entry.taskId);
          renderHistoryEntry(entry);
        });

        // Render active/running tasks
        // active items: { taskId, sourceNodeId, targetNodeId, type, payload: { prompt }, createdAt, timeoutMs }
        active.forEach(function (task) {
          if (renderedTaskIds.has(task.taskId)) return;
          renderedTaskIds.add(task.taskId);
          renderActiveTask(task);
        });

        scrollChatToBottom();
      })
      .catch(function (err) {
        if (loadingEl) loadingEl.textContent = "Failed to load history";
        console.error("Failed to load chat history:", err);
      });
  }

  function renderHistoryEntry(entry) {
    var container = document.getElementById("chat-messages");
    if (!container) return;
    var isDashboard = entry.sourceNodeId === "dashboard";
    var timestamp = entry.createdAt || entry.completedAt;

    // Sent bubble (prompt)
    if (entry.prompt) {
      var sentDiv = document.createElement("div");
      sentDiv.className = "chat-msg" + (isDashboard ? " sent" : " system");

      if (isDashboard) {
        sentDiv.innerHTML =
          '<div class="chat-avatar user">You</div>' +
          '<div class="chat-bubble">' +
            '<div class="chat-bubble-header">' +
              '<span class="chat-bubble-sender">You</span>' +
              '<span class="chat-bubble-target">\u2192 ' + esc(resolveNodeName(entry.targetNodeId)) + '</span>' +
            '</div>' +
            '<div class="chat-bubble-body">' + esc(entry.prompt) + '</div>' +
            '<div class="chat-bubble-footer">' +
              '<span>' + formatChatTime(timestamp) + '</span>' +
            '</div>' +
          '</div>';
      } else {
        // Agent-to-agent: show as system flow
        sentDiv.innerHTML =
          '<div class="chat-avatar node">' + getNodeAvatarLetter(entry.sourceNodeId) + '</div>' +
          '<div class="chat-bubble flow">' +
            '<div class="chat-bubble-header">' +
              '<span class="chat-bubble-sender">' + esc(resolveNodeName(entry.sourceNodeId)) + '</span>' +
              '<span class="chat-bubble-target">\u2192 ' + esc(resolveNodeName(entry.targetNodeId)) + '</span>' +
            '</div>' +
            '<div class="chat-bubble-body">' + esc(entry.prompt) + '</div>' +
            '<div class="chat-bubble-footer">' +
              '<span>' + formatChatTime(timestamp) + '</span>' +
            '</div>' +
          '</div>';
      }
      container.appendChild(sentDiv);
    }

    // Received bubble (response)
    var recvDiv = document.createElement("div");
    recvDiv.className = "chat-msg received";
    var isError = !entry.success;
    var nodeName = resolveNodeName(entry.targetNodeId);
    var body = isError
      ? esc((entry.error?.code || "ERROR") + ": " + (entry.error?.message || "Unknown error"))
      : esc(entry.result || "(no output)");

    recvDiv.innerHTML =
      '<div class="chat-avatar node">' + getNodeAvatarLetter(entry.targetNodeId) + '</div>' +
      '<div class="chat-bubble' + (isError ? ' error' : '') + '">' +
        '<button class="chat-copy-btn" onclick="copyChatBubble(this)">Copy</button>' +
        '<div class="chat-bubble-header">' +
          '<span class="chat-bubble-sender">' + esc(nodeName) + '</span>' +
          '<span class="chat-bubble-status ' + (isError ? 'failed' : 'success') + '">' + (isError ? 'failed' : 'success') + '</span>' +
        '</div>' +
        '<div class="chat-bubble-body mono' + (isError ? ' error-text' : '') + '">' + body + '</div>' +
        '<div class="chat-bubble-footer">' +
          '<span>' + formatChatTime(entry.completedAt) + '</span>' +
          (entry.durationMs ? '<span class="chat-bubble-duration">' + formatChatDuration(entry.durationMs) + '</span>' : '') +
        '</div>' +
      '</div>';
    container.appendChild(recvDiv);
  }

  function renderActiveTask(task) {
    var container = document.getElementById("chat-messages");
    if (!container) return;
    var isDashboard = task.sourceNodeId === "dashboard";
    var prompt = task.payload?.prompt || "";

    // Sent bubble
    if (prompt) {
      var sentDiv = document.createElement("div");
      sentDiv.className = "chat-msg" + (isDashboard ? " sent" : " system");

      if (isDashboard) {
        sentDiv.innerHTML =
          '<div class="chat-avatar user">You</div>' +
          '<div class="chat-bubble">' +
            '<div class="chat-bubble-header">' +
              '<span class="chat-bubble-sender">You</span>' +
              '<span class="chat-bubble-target">\u2192 ' + esc(resolveNodeName(task.targetNodeId)) + '</span>' +
            '</div>' +
            '<div class="chat-bubble-body">' + esc(prompt) + '</div>' +
            '<div class="chat-bubble-footer">' +
              '<span>' + formatChatTime(task.createdAt) + '</span>' +
            '</div>' +
          '</div>';
      } else {
        sentDiv.innerHTML =
          '<div class="chat-avatar node">' + getNodeAvatarLetter(task.sourceNodeId) + '</div>' +
          '<div class="chat-bubble flow">' +
            '<div class="chat-bubble-header">' +
              '<span class="chat-bubble-sender">' + esc(resolveNodeName(task.sourceNodeId)) + '</span>' +
              '<span class="chat-bubble-target">\u2192 ' + esc(resolveNodeName(task.targetNodeId)) + '</span>' +
            '</div>' +
            '<div class="chat-bubble-body">' + esc(prompt) + '</div>' +
            '<div class="chat-bubble-footer">' +
              '<span>' + formatChatTime(task.createdAt) + '</span>' +
            '</div>' +
          '</div>';
      }
      container.appendChild(sentDiv);
    }

    // Typing indicator bubble
    var typingDiv = document.createElement("div");
    typingDiv.className = "chat-msg received";
    typingDiv.id = "typing-" + task.taskId;
    var nodeName = resolveNodeName(task.targetNodeId);
    typingDiv.innerHTML =
      '<div class="chat-avatar node">' + getNodeAvatarLetter(task.targetNodeId) + '</div>' +
      '<div class="chat-bubble">' +
        '<div class="chat-bubble-header">' +
          '<span class="chat-bubble-sender">' + esc(nodeName) + '</span>' +
          '<span class="chat-bubble-status running">running</span>' +
        '</div>' +
        '<div class="chat-typing-dots"><span></span><span></span><span></span></div>' +
        '<div class="chat-streaming-text" id="stream-' + task.taskId + '"></div>' +
      '</div>';
    container.appendChild(typingDiv);

    // Track this as pending so handleTaskResult picks it up
    pendingTaskIds.set(task.taskId, "typing-" + task.taskId);
  }

  window.sendChatMessage = function () {
    var target = document.getElementById("console-target")?.value;
    if (!target) return;

    var chatInput = document.getElementById("chat-input");
    var prompt = chatInput?.value?.trim();
    if (!prompt) return;

    // Get target name for display
    var targetName = resolveNodeName(target === "all" ? "all" : target);
    if (target === "all") targetName = "All Nodes";

    // Clear input
    chatInput.value = "";
    chatInput.style.height = "auto";

    // Add sent message
    var sentDiv = document.createElement("div");
    sentDiv.className = "chat-msg sent";
    sentDiv.innerHTML =
      '<div class="chat-avatar user">You</div>' +
      '<div class="chat-bubble">' +
        '<div class="chat-bubble-header">' +
          '<span class="chat-bubble-sender">You</span>' +
          '<span class="chat-bubble-target">\u2192 ' + esc(targetName) + '</span>' +
        '</div>' +
        '<div class="chat-bubble-body">' + esc(prompt) + '</div>' +
        '<div class="chat-bubble-footer">' +
          '<span>' + formatChatTime(new Date().toISOString()) + '</span>' +
        '</div>' +
      '</div>';
    var container = document.getElementById("chat-messages");
    if (container) container.appendChild(sentDiv);
    scrollChatToBottom();

    // Disable send button
    var sendBtn = document.getElementById("chat-send-btn");
    if (sendBtn) sendBtn.disabled = true;

    // Send to API
    fetch("/api/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetNodeId: target,
        type: "prompt",
        payload: { type: "prompt", prompt: prompt },
      }),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        // Build taskId -> targetNodeId mapping from response
        var taskNodeMap = {};
        if (data.tasks) {
          data.tasks.forEach(function (t) { taskNodeMap[t.taskId] = t.targetNodeId; });
        }
        var taskIds = data.taskIds || (data.taskId ? [data.taskId] : []);
        taskIds.forEach(function (taskId) {
          renderedTaskIds.add(taskId);
          var tNodeId = taskNodeMap[taskId] || data.targetNodeId || target;
          var tName = resolveNodeName(tNodeId);
          // Add typing indicator for each task
          var typingDiv = document.createElement("div");
          typingDiv.className = "chat-msg received";
          typingDiv.id = "typing-" + taskId;
          typingDiv.innerHTML =
            '<div class="chat-avatar node">' + getNodeAvatarLetter(tNodeId) + '</div>' +
            '<div class="chat-bubble">' +
              '<div class="chat-bubble-header">' +
                '<span class="chat-bubble-sender">' + esc(tName) + '</span>' +
                '<span class="chat-bubble-status running">running</span>' +
              '</div>' +
              '<div class="chat-typing-dots"><span></span><span></span><span></span></div>' +
              '<div class="chat-streaming-text" id="stream-' + taskId + '"></div>' +
            '</div>';
          if (container) container.appendChild(typingDiv);
          pendingTaskIds.set(taskId, "typing-" + taskId);
        });
        scrollChatToBottom();
      })
      .catch(function (err) {
        // Show error as system message
        var errDiv = document.createElement("div");
        errDiv.className = "chat-msg received";
        errDiv.innerHTML =
          '<div class="chat-avatar node">!</div>' +
          '<div class="chat-bubble error">' +
            '<div class="chat-bubble-header">' +
              '<span class="chat-bubble-sender">System</span>' +
              '<span class="chat-bubble-status failed">error</span>' +
            '</div>' +
            '<div class="chat-bubble-body mono error-text">' + esc(err.message) + '</div>' +
          '</div>';
        if (container) container.appendChild(errDiv);
        if (sendBtn) sendBtn.disabled = false;
      });
  };

  function handleTaskResult(result) {
    var typingId = pendingTaskIds.get(result.taskId);

    if (typingId) {
      // This was a tracked task — remove typing bubble
      pendingTaskIds.delete(result.taskId);
      var typingEl = document.getElementById(typingId);
      if (typingEl) typingEl.remove();
    } else if (!renderedTaskIds.has(result.taskId)) {
      // Untracked task (e.g. agent-to-agent initiated while console was open)
      // Show it as a new system-style entry
      renderedTaskIds.add(result.taskId);
      renderHistoryEntry({
        taskId: result.taskId,
        sourceNodeId: result.sourceNodeId,
        targetNodeId: result.targetNodeId,
        success: result.success,
        result: result.result,
        error: result.error,
        durationMs: result.durationMs,
        completedAt: result.completedAt || new Date().toISOString(),
        prompt: result.prompt || null,
        createdAt: result.createdAt || null,
      });
      scrollChatToBottom();
      return;
    }

    renderedTaskIds.add(result.taskId);

    // Add response bubble
    var container = document.getElementById("chat-messages");
    if (!container) return;
    var isError = !result.success;
    var nodeName = resolveNodeName(result.targetNodeId);
    var body = isError
      ? esc((result.error?.code || "ERROR") + ": " + (result.error?.message || "Unknown error"))
      : esc(result.result || "(no output)");

    var recvDiv = document.createElement("div");
    recvDiv.className = "chat-msg received";
    recvDiv.innerHTML =
      '<div class="chat-avatar node">' + getNodeAvatarLetter(result.targetNodeId) + '</div>' +
      '<div class="chat-bubble' + (isError ? ' error' : '') + '">' +
        '<button class="chat-copy-btn" onclick="copyChatBubble(this)">Copy</button>' +
        '<div class="chat-bubble-header">' +
          '<span class="chat-bubble-sender">' + esc(nodeName) + '</span>' +
          '<span class="chat-bubble-status ' + (isError ? 'failed' : 'success') + '">' + (isError ? 'failed' : 'success') + '</span>' +
        '</div>' +
        '<div class="chat-bubble-body mono' + (isError ? ' error-text' : '') + '">' + body + '</div>' +
        '<div class="chat-bubble-footer">' +
          '<span>' + formatChatTime(result.completedAt || new Date().toISOString()) + '</span>' +
          (result.durationMs ? '<span class="chat-bubble-duration">' + formatChatDuration(result.durationMs) + '</span>' : '') +
        '</div>' +
      '</div>';
    container.appendChild(recvDiv);
    scrollChatToBottom();

    // Re-enable send button if no more pending
    if (pendingTaskIds.size === 0) {
      var btn = document.getElementById("chat-send-btn");
      if (btn) btn.disabled = false;
    }
  }

  function handleTaskProgress(progress) {
    if (!progress.taskId) return;
    var streamEl = document.getElementById("stream-" + progress.taskId);
    if (streamEl) {
      // Hide typing dots once we have output
      var dots = streamEl.previousElementSibling;
      if (dots && dots.classList.contains("chat-typing-dots")) {
        dots.style.display = "none";
      }
      streamEl.textContent = (streamEl.textContent || "") + (progress.chunk || "");
      streamEl.scrollTop = streamEl.scrollHeight;
      scrollChatToBottom();
    }
  }

  function scrollChatToBottom() {
    var container = document.getElementById("chat-messages");
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  function formatChatTime(isoString) {
    if (!isoString) return "";
    return new Date(isoString).toLocaleTimeString("en-GB", { hour12: false, hour: "2-digit", minute: "2-digit" });
  }

  function formatChatDuration(ms) {
    if (ms < 1000) return ms + "ms";
    var s = (ms / 1000).toFixed(1);
    return s + "s";
  }

  function resolveNodeName(nodeId) {
    if (!nodeId) return "Unknown";
    if (nodeId === "dashboard") return "Dashboard";
    if (knownNodeNames[nodeId]) return knownNodeNames[nodeId];
    // Try to find from the select options
    var select = document.getElementById("console-target");
    if (select) {
      for (var i = 0; i < select.options.length; i++) {
        if (select.options[i].value === nodeId) {
          var text = select.options[i].textContent.trim();
          // Remove status icon prefix (● or ○) and [offline] suffix
          var clean = text.replace(/^[●○]\s*/, "").replace(/\s*\[offline\]$/, "");
          return clean || nodeId;
        }
      }
    }
    return nodeId;
  }

  function getNodeAvatarLetter(nodeId) {
    var name = resolveNodeName(nodeId);
    if (!name) return "?";
    return esc(name.charAt(0).toUpperCase());
  }

  window.copyChatBubble = function (btn) {
    var bubble = btn.closest(".chat-bubble");
    var body = bubble?.querySelector(".chat-bubble-body");
    if (body) {
      navigator.clipboard.writeText(body.textContent);
      btn.textContent = "Copied!";
      setTimeout(function () { btn.textContent = "Copy"; }, 2000);
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
  // Removed Ctrl+Enter shortcut (chat uses Enter directly)

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

  // --- Graph Page Engine ---
  function initGraph() {
    var canvas = document.getElementById("graph-canvas");
    if (!canvas) return;

    var svgEl = document.getElementById("graph-svg");
    var connLayer = document.getElementById("graph-connections-layer");
    var detailOverlay = document.getElementById("graph-detail-overlay");

    // State
    var graphState = {
      nodes: {},
      tasks: {},
      showOffline: true,
      zoom: 1,
      pan: { x: 60, y: 20 },
      dragging: null,
      dragOffset: { x: 0, y: 0 },
      panning: false,
      panStart: { x: 0, y: 0 },
      selectedTask: null,
      needsRender: true,
    };

    var NODE_W = 260;
    var NODE_H = 160;

    // --- Helpers ---
    function hexToRgb(hex) {
      var r = parseInt(hex.slice(1, 3), 16);
      var g = parseInt(hex.slice(3, 5), 16);
      var b = parseInt(hex.slice(5, 7), 16);
      return r + "," + g + "," + b;
    }

    function formatDuration(ms) {
      var s = Math.floor(ms / 1000);
      var m = Math.floor(s / 60);
      return m + "m " + (s % 60) + "s";
    }

    function getPlatformIcon(platform) {
      switch (platform) {
        case "darwin": return "\uF8FF";
        case "win32": return "\u229E";
        case "linux": return "\u2318";
        default: return "\u25CF";
      }
    }

    // --- Source node ID resolution ---
    function resolveSourceNodeId(sourceId) {
      if (!sourceId) return null;
      if (sourceId === "dashboard") return "__dashboard__";
      var mcpMatch = sourceId.match(/^(.+)-mcp-[0-9a-f-]+$/);
      if (mcpMatch) return mcpMatch[1];
      return sourceId;
    }

    // --- Circular layout ---
    function layoutNodes() {
      var ids = Object.keys(graphState.nodes);
      var needsLayout = ids.filter(function (id) {
        var n = graphState.nodes[id];
        return n.x === 0 && n.y === 0;
      });
      if (needsLayout.length === 0) return;

      var cx = (canvas.clientWidth / 2 - graphState.pan.x) / graphState.zoom - NODE_W / 2;
      var cy = (canvas.clientHeight / 2 - graphState.pan.y) / graphState.zoom - NODE_H / 2;
      var radius = Math.min(canvas.clientWidth, canvas.clientHeight) * 0.3 / graphState.zoom;
      var total = ids.length;

      needsLayout.forEach(function (id) {
        var idx = ids.indexOf(id);
        var angle = (2 * Math.PI * idx) / total - Math.PI / 2;
        graphState.nodes[id].x = cx + Math.cos(angle) * radius;
        graphState.nodes[id].y = cy + Math.sin(angle) * radius;
      });
    }

    // --- Node DOM ---
    function createNodeElement(node) {
      var div = document.createElement("div");
      div.className = "graph-node";
      div.dataset.graphNodeId = node.id;
      updateNodeInner(div, node);
      canvas.appendChild(div);
      node.el = div;

      div.addEventListener("mousedown", function (e) {
        if (e.button !== 0) return;
        e.stopPropagation();
        graphState.dragging = node;
        graphState.dragOffset = {
          x: e.clientX / graphState.zoom - node.x,
          y: e.clientY / graphState.zoom - node.y,
        };
        div.classList.add("dragging");
      });

      return div;
    }

    function updateNodeInner(div, node) {
      var st = node.status || "offline";
      var cpu = node.metrics ? (node.metrics.cpuPercent || 0) : 0;
      var ramPct = node.metrics && node.metrics.memoryTotalMB > 0
        ? ((node.metrics.memoryUsedMB / node.metrics.memoryTotalMB) * 100)
        : 0;
      var ramUsed = node.metrics ? (node.metrics.memoryUsedMB / 1024).toFixed(1) : "0";
      var ramTotal = node.metrics ? (node.metrics.memoryTotalMB / 1024).toFixed(0) : "0";
      var cpuColor = cpu > 70 ? "var(--status-offline)" : cpu > 40 ? "var(--status-busy)" : "var(--status-online)";
      var ramColor = ramPct > 90 ? "var(--status-offline)" : ramPct > 60 ? "var(--status-busy)" : "var(--status-online)";

      div.innerHTML =
        '<div class="graph-node-header status-' + st + '">' +
          '<span class="graph-node-platform">' + getPlatformIcon(node.platform) + '</span>' +
          '<div class="graph-node-title">' +
            '<div class="graph-node-name">' + esc(node.name) + '</div>' +
            '<div class="graph-node-id">' + esc(node.id) + '</div>' +
          '</div>' +
          '<span class="graph-node-status st-' + st + '">' + st + '</span>' +
        '</div>' +
        '<div class="graph-node-body">' +
          '<div class="graph-node-subtitle">' + esc((node.platform || "") + "/" + (node.arch || "")) + '</div>' +
          '<div class="graph-node-metrics">' +
            '<div class="graph-node-metric">' +
              '<div class="graph-node-metric-label">CPU</div>' +
              '<div class="graph-node-metric-bar"><div class="graph-node-metric-fill" style="width:' + cpu.toFixed(0) + '%;background:' + cpuColor + '"></div></div>' +
              '<div class="graph-node-metric-value">' + cpu.toFixed(0) + '%</div>' +
            '</div>' +
            '<div class="graph-node-metric">' +
              '<div class="graph-node-metric-label">RAM</div>' +
              '<div class="graph-node-metric-bar"><div class="graph-node-metric-fill" style="width:' + ramPct.toFixed(0) + '%;background:' + ramColor + '"></div></div>' +
              '<div class="graph-node-metric-value">' + ramUsed + '/' + ramTotal + ' GB</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="graph-port left"></div>' +
        '<div class="graph-port right"></div>' +
        '<div class="graph-port top"></div>' +
        '<div class="graph-port bottom"></div>';
    }

    function positionNode(node) {
      if (!node.el) return;
      var st = node.status || "offline";
      node.el.style.left = (node.x * graphState.zoom + graphState.pan.x) + "px";
      node.el.style.top = (node.y * graphState.zoom + graphState.pan.y) + "px";
      node.el.style.transform = "scale(" + graphState.zoom + ")";
      node.el.style.transformOrigin = "top left";

      var isOffline = st === "offline";
      node.el.classList.toggle("offline", isOffline);
      node.el.classList.toggle("hidden-offline", isOffline && !graphState.showOffline);
    }

    // --- Dashboard virtual node ---
    function ensureDashboardNode() {
      if (!graphState.nodes["__dashboard__"]) {
        graphState.nodes["__dashboard__"] = {
          id: "__dashboard__",
          name: "Dashboard",
          nodeName: "Dashboard",
          platform: "web",
          arch: "",
          status: "online",
          metrics: null,
          x: 0,
          y: 0,
          el: null,
        };
      }
    }

    // --- Connection rendering ---
    function getEdgePoint(node, angle) {
      var cx = node.x + NODE_W / 2;
      var cy = node.y + NODE_H / 2;
      var hw = NODE_W / 2 + 5;
      var hh = NODE_H / 2 + 5;
      var dx = Math.cos(angle);
      var dy = Math.sin(angle);
      var sx = Math.abs(dx) > 0.001 ? hw / Math.abs(dx) : Infinity;
      var sy = Math.abs(dy) > 0.001 ? hh / Math.abs(dy) : Infinity;
      var s = Math.min(sx, sy);
      return { x: cx + dx * s, y: cy + dy * s };
    }

    function getNodeCenter(node) {
      return { x: node.x + NODE_W / 2, y: node.y + NODE_H / 2 };
    }

    function tx(v) {
      return (v * graphState.zoom + graphState.pan.x).toFixed(1);
    }

    function ty(v) {
      return (v * graphState.zoom + graphState.pan.y).toFixed(1);
    }

    function getConnectionGroups() {
      var groups = {};
      var taskIds = Object.keys(graphState.tasks);
      taskIds.forEach(function (tid) {
        var task = graphState.tasks[tid];
        if (!task.resolvedSourceId || !task.resolvedTargetId) return;
        var src = task.resolvedSourceId;
        var tgt = task.resolvedTargetId;
        var key = src < tgt ? src + "|" + tgt : tgt + "|" + src;
        if (!groups[key]) groups[key] = { forward: [], reverse: [] };
        if (src <= tgt) {
          groups[key].forward.push(task);
        } else {
          groups[key].reverse.push(task);
        }
      });
      return groups;
    }

    function renderConnections() {
      connLayer.innerHTML = "";
      // Remove old badges
      var oldBadges = canvas.querySelectorAll(".graph-task-badge");
      for (var i = 0; i < oldBadges.length; i++) oldBadges[i].remove();

      var groups = getConnectionGroups();
      var groupKeys = Object.keys(groups);

      groupKeys.forEach(function (key) {
        var group = groups[key];
        var isBidi = group.forward.length > 0 && group.reverse.length > 0;

        group.forward.forEach(function (task) {
          var src = graphState.nodes[task.resolvedSourceId];
          var tgt = graphState.nodes[task.resolvedTargetId];
          if (!src || !tgt) return;
          if (!graphState.showOffline && (src.status === "offline" || tgt.status === "offline")) return;

          if (task.resolvedSourceId === task.resolvedTargetId) {
            renderSelfLoop(src, task);
          } else if (isBidi) {
            renderBidirectionalLine(src, tgt, task, 1);
          } else {
            renderUnidirectionalLine(src, tgt, task);
          }
        });

        group.reverse.forEach(function (task) {
          var src = graphState.nodes[task.resolvedSourceId];
          var tgt = graphState.nodes[task.resolvedTargetId];
          if (!src || !tgt) return;
          if (!graphState.showOffline && (src.status === "offline" || tgt.status === "offline")) return;

          if (task.resolvedSourceId === task.resolvedTargetId) {
            renderSelfLoop(src, task);
          } else if (isBidi) {
            renderBidirectionalLine(src, tgt, task, -1);
          } else {
            renderUnidirectionalLine(src, tgt, task);
          }
        });
      });

      // Activate ports for active tasks
      Object.keys(graphState.tasks).forEach(function (tid) {
        var task = graphState.tasks[tid];
        var srcEl = graphState.nodes[task.resolvedSourceId]?.el;
        var tgtEl = graphState.nodes[task.resolvedTargetId]?.el;
        if (srcEl) {
          srcEl.querySelectorAll(".graph-port.right, .graph-port.bottom").forEach(function (p) {
            p.classList.add("active");
          });
        }
        if (tgtEl) {
          tgtEl.querySelectorAll(".graph-port.left, .graph-port.top").forEach(function (p) {
            p.classList.add("active");
          });
        }
      });
    }

    function renderUnidirectionalLine(src, tgt, task) {
      var sc = getNodeCenter(src);
      var tc = getNodeCenter(tgt);
      var angle = Math.atan2(tc.y - sc.y, tc.x - sc.x);
      var sp = getEdgePoint(src, angle);
      var tp = getEdgePoint(tgt, angle + Math.PI);

      var mx = (sp.x + tp.x) / 2;
      var my = (sp.y + tp.y) / 2 - 50;
      var d = "M" + tx(sp.x) + "," + ty(sp.y) + " Q" + tx(mx) + "," + ty(my) + " " + tx(tp.x) + "," + ty(tp.y);
      var colorHex = "#3b82f6";

      addGlowPath(d, colorHex);
      addActivePath(d, colorHex, "graph-arrow-blue", task);
      addParticles(d, colorHex);

      var bx = mx * graphState.zoom + graphState.pan.x;
      var by = (my - 12) * graphState.zoom + graphState.pan.y;
      addBadge(bx, by, task, colorHex);
    }

    function renderBidirectionalLine(src, tgt, task, offset) {
      var sc = getNodeCenter(src);
      var tc = getNodeCenter(tgt);
      var angle = Math.atan2(tc.y - sc.y, tc.x - sc.x);
      var perpX = -Math.sin(angle) * 18;
      var perpY = Math.cos(angle) * 18;

      var sp = getEdgePoint(src, angle);
      var tp = getEdgePoint(tgt, angle + Math.PI);

      var spOff = { x: sp.x + perpX * offset, y: sp.y + perpY * offset };
      var tpOff = { x: tp.x + perpX * offset, y: tp.y + perpY * offset };
      var mx = (spOff.x + tpOff.x) / 2 + perpX * offset * 1.5;
      var my = (spOff.y + tpOff.y) / 2 + perpY * offset * 1.5 - 30 * offset;

      var d = "M" + tx(spOff.x) + "," + ty(spOff.y) + " Q" + tx(mx) + "," + ty(my) + " " + tx(tpOff.x) + "," + ty(tpOff.y);
      var colorHex = offset === 1 ? "#22c55e" : "#7c3aed";
      var arrowId = offset === 1 ? "graph-arrow-green" : "graph-arrow-purple";

      addGlowPath(d, colorHex);
      addActivePath(d, colorHex, arrowId, task);
      addParticles(d, colorHex);

      var bx = mx * graphState.zoom + graphState.pan.x;
      var by = (my - 12) * graphState.zoom + graphState.pan.y;
      addBadge(bx, by, task, colorHex);
    }

    function renderSelfLoop(node, task) {
      var r = node;
      var bx1 = r.x + 230, by1 = r.y + 145;
      var bx2 = r.x + 30, by2 = r.y + 145;
      var cx1 = r.x + 310, cy1 = r.y + 220;
      var cx2 = r.x + 270, cy2 = r.y + 290;
      var cx3 = r.x - 10, cy3 = r.y + 290;
      var cx4 = r.x - 50, cy4 = r.y + 220;

      var d = "M" + tx(bx1) + "," + ty(by1) + " C" + tx(cx1) + "," + ty(cy1) + " " + tx(cx2) + "," + ty(cy2) + " " + tx((cx2 + cx3) / 2) + "," + ty(cy2) + " C" + tx(cx3) + "," + ty(cy2) + " " + tx(cx4) + "," + ty(cy4) + " " + tx(bx2) + "," + ty(by2);
      var colorHex = "#f59e0b";

      addGlowPath(d, colorHex);
      addActivePath(d, colorHex, "graph-arrow-amber", task);
      addParticles(d, colorHex);

      var badgeX = (r.x + 130) * graphState.zoom + graphState.pan.x;
      var badgeY = (r.y + 280) * graphState.zoom + graphState.pan.y;
      addBadge(badgeX, badgeY, task, colorHex);
    }

    function addGlowPath(d, color) {
      var glow = document.createElementNS("http://www.w3.org/2000/svg", "path");
      glow.setAttribute("d", d);
      glow.setAttribute("class", "graph-conn-glow");
      glow.setAttribute("stroke", color);
      connLayer.appendChild(glow);
    }

    function addActivePath(d, color, arrowId, task) {
      var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      path.setAttribute("class", "graph-conn active-task");
      path.setAttribute("stroke", color);
      path.setAttribute("marker-end", "url(#" + arrowId + ")");
      path.style.cursor = "pointer";
      path.addEventListener("click", function () { showDetail(task); });
      connLayer.appendChild(path);
    }

    function addParticles(d, color) {
      for (var i = 0; i < 3; i++) {
        var circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("r", "3");
        circle.setAttribute("fill", color);
        circle.style.filter = "drop-shadow(0 0 4px " + color + ")";
        var anim = document.createElementNS("http://www.w3.org/2000/svg", "animateMotion");
        anim.setAttribute("dur", "2.5s");
        anim.setAttribute("repeatCount", "indefinite");
        anim.setAttribute("begin", (i * 0.8) + "s");
        anim.setAttribute("path", d);
        circle.appendChild(anim);
        connLayer.appendChild(circle);
      }
    }

    function addBadge(x, y, task, colorHex) {
      var badge = document.createElement("div");
      badge.className = "graph-task-badge";
      var rgb = hexToRgb(colorHex);
      badge.style.cssText = "left:" + x + "px;top:" + y + "px;transform:translate(-50%,-50%) scale(" + graphState.zoom + ");color:" + colorHex + ";background:rgba(" + rgb + ",.12);border-color:rgba(" + rgb + ",.3);";
      var elapsed = formatDuration(Date.now() - (task.startTime || Date.now()));
      var label = (task.prompt || "Task").slice(0, 20);
      if (label.length >= 20) label += "...";
      badge.innerHTML = '<div class="badge-spinner"></div> ' + esc(label) + ' <span class="timer">' + elapsed + '</span>';
      badge.addEventListener("click", function () { showDetail(task); });
      canvas.appendChild(badge);
    }

    // --- Detail panel ---
    function showDetail(task) {
      graphState.selectedTask = task;
      detailOverlay.classList.add("open");
      document.getElementById("graph-d-source").textContent = task.resolvedSourceId || task.sourceNodeId || "-";
      document.getElementById("graph-d-target").textContent = task.resolvedTargetId || task.targetNodeId || "-";
      document.getElementById("graph-d-taskid").textContent = (task.taskId || "-").slice(0, 8);
      document.getElementById("graph-d-prompt").textContent = task.prompt || "";
      document.getElementById("graph-d-output").innerHTML = esc(task.output || "") + '<span class="cursor-blink">\u2588</span>';
      updateDetailTimer();
    }

    function updateDetailTimer() {
      if (!graphState.selectedTask) return;
      var el = document.getElementById("graph-d-duration");
      if (el) el.textContent = formatDuration(Date.now() - (graphState.selectedTask.startTime || Date.now()));
    }

    document.getElementById("graph-detail-close").addEventListener("click", function () {
      detailOverlay.classList.remove("open");
      graphState.selectedTask = null;
    });

    detailOverlay.addEventListener("click", function (e) {
      if (e.target === detailOverlay) {
        detailOverlay.classList.remove("open");
        graphState.selectedTask = null;
      }
    });

    document.getElementById("graph-d-cancel").addEventListener("click", function () {
      if (!graphState.selectedTask) return;
      var tid = graphState.selectedTask.taskId;
      fetch("/api/tasks/" + encodeURIComponent(tid), { method: "DELETE" })
        .then(function () {
          delete graphState.tasks[tid];
          detailOverlay.classList.remove("open");
          graphState.selectedTask = null;
          graphState.needsRender = true;
        })
        .catch(function (err) { console.error("Cancel task failed:", err); });
    });

    // --- Pan / Zoom / Drag ---
    canvas.addEventListener("mousedown", function (e) {
      if (e.target !== canvas && e.target !== svgEl) return;
      graphState.panning = true;
      graphState.panStart = { x: e.clientX - graphState.pan.x, y: e.clientY - graphState.pan.y };
      canvas.classList.add("dragging-canvas");
    });

    window.addEventListener("mousemove", function (e) {
      if (graphState.dragging) {
        var n = graphState.dragging;
        n.x = e.clientX / graphState.zoom - graphState.dragOffset.x;
        n.y = e.clientY / graphState.zoom - graphState.dragOffset.y;
        graphState.needsRender = true;
      } else if (graphState.panning) {
        graphState.pan.x = e.clientX - graphState.panStart.x;
        graphState.pan.y = e.clientY - graphState.panStart.y;
        graphState.needsRender = true;
      }
    });

    window.addEventListener("mouseup", function () {
      if (graphState.dragging) {
        if (graphState.dragging.el) graphState.dragging.el.classList.remove("dragging");
        graphState.dragging = null;
      }
      graphState.panning = false;
      canvas.classList.remove("dragging-canvas");
    });

    canvas.addEventListener("wheel", function (e) {
      e.preventDefault();
      var delta = e.deltaY > 0 ? -0.08 : 0.08;
      graphState.zoom = Math.max(0.3, Math.min(2.5, graphState.zoom + delta));
      graphState.needsRender = true;
    }, { passive: false });

    document.getElementById("graph-zoom-in").addEventListener("click", function () {
      graphState.zoom = Math.min(2.5, graphState.zoom + 0.15);
      graphState.needsRender = true;
    });

    document.getElementById("graph-zoom-out").addEventListener("click", function () {
      graphState.zoom = Math.max(0.3, graphState.zoom - 0.15);
      graphState.needsRender = true;
    });

    document.getElementById("graph-fit-view").addEventListener("click", function () {
      graphState.zoom = 1;
      graphState.pan = { x: 60, y: 20 };
      graphState.needsRender = true;
    });

    document.getElementById("graph-toggle-offline").addEventListener("click", function () {
      graphState.showOffline = !graphState.showOffline;
      this.classList.toggle("active", !graphState.showOffline);
      graphState.needsRender = true;
    });

    // --- Main render ---
    function render() {
      // Position all nodes
      Object.keys(graphState.nodes).forEach(function (id) {
        var node = graphState.nodes[id];
        if (!node.el) createNodeElement(node);
        positionNode(node);
      });

      renderConnections();
      updateStatusBar();
    }

    function updateStatusBar() {
      var ids = Object.keys(graphState.nodes).filter(function (id) { return id !== "__dashboard__"; });
      var online = ids.filter(function (id) { return graphState.nodes[id].status !== "offline"; });
      var taskCount = Object.keys(graphState.tasks).length;

      var sbNodes = document.getElementById("graph-sb-nodes");
      var sbOnline = document.getElementById("graph-sb-online");
      var sbTasks = document.getElementById("graph-sb-tasks");
      if (sbNodes) sbNodes.textContent = ids.length + " Nodes";
      if (sbOnline) sbOnline.textContent = online.length + " Online";
      if (sbTasks) sbTasks.textContent = taskCount + " Active Tasks";
    }

    // --- Animation frame loop ---
    function animLoop() {
      if (graphState.needsRender) {
        graphState.needsRender = false;
        render();
      }
      requestAnimationFrame(animLoop);
    }

    // --- Public API for socket handlers ---
    window.__graphEngine = {
      updateNodes: function (nodesArray) {
        var seen = {};
        nodesArray.forEach(function (n) {
          seen[n.nodeId] = true;
          if (graphState.nodes[n.nodeId]) {
            // Update existing
            var existing = graphState.nodes[n.nodeId];
            existing.name = n.nodeName;
            existing.nodeName = n.nodeName;
            existing.status = n.status;
            existing.platform = n.platform;
            existing.arch = n.arch;
            existing.metrics = n.metrics;
            if (existing.el) updateNodeInner(existing.el, existing);
          } else {
            // Add new
            graphState.nodes[n.nodeId] = {
              id: n.nodeId,
              name: n.nodeName,
              nodeName: n.nodeName,
              platform: n.platform,
              arch: n.arch,
              status: n.status,
              metrics: n.metrics,
              x: 0,
              y: 0,
              el: null,
            };
          }
        });

        // Remove nodes no longer present (except dashboard)
        Object.keys(graphState.nodes).forEach(function (id) {
          if (id === "__dashboard__") return;
          if (!seen[id]) {
            if (graphState.nodes[id].el) graphState.nodes[id].el.remove();
            delete graphState.nodes[id];
          }
        });

        layoutNodes();
        graphState.needsRender = true;
      },

      updateMetrics: function (nodeId, metrics) {
        if (graphState.nodes[nodeId]) {
          graphState.nodes[nodeId].metrics = metrics;
          if (graphState.nodes[nodeId].el) {
            updateNodeInner(graphState.nodes[nodeId].el, graphState.nodes[nodeId]);
          }
        }
      },

      handleTaskComplete: function (result) {
        if (graphState.tasks[result.taskId]) {
          delete graphState.tasks[result.taskId];
          graphState.needsRender = true;
        }
      },

      handleTaskProgress: function (progress) {
        if (graphState.tasks[progress.taskId]) {
          graphState.tasks[progress.taskId].output = (graphState.tasks[progress.taskId].output || "") + (progress.chunk || "");
          // Update detail panel if viewing this task
          if (graphState.selectedTask && graphState.selectedTask.taskId === progress.taskId) {
            var outEl = document.getElementById("graph-d-output");
            if (outEl) outEl.innerHTML = esc(graphState.tasks[progress.taskId].output) + '<span class="cursor-blink">\u2588</span>';
          }
        }
      },
    };

    // --- Task polling ---
    function pollActiveTasks() {
      fetch("/api/tasks?active=true")
        .then(function (res) { return res.json(); })
        .then(function (tasks) {
          if (!Array.isArray(tasks)) return;

          var seen = {};
          tasks.forEach(function (t) {
            seen[t.taskId] = true;
            if (!graphState.tasks[t.taskId]) {
              var srcId = resolveSourceNodeId(t.sourceNodeId);
              var tgtId = t.targetNodeId || t.nodeId;

              // Ensure dashboard node if source is dashboard
              if (srcId === "__dashboard__") ensureDashboardNode();

              graphState.tasks[t.taskId] = {
                taskId: t.taskId,
                sourceNodeId: t.sourceNodeId,
                targetNodeId: tgtId,
                resolvedSourceId: srcId,
                resolvedTargetId: tgtId,
                prompt: t.prompt || t.payload?.prompt || "",
                output: t.output || "",
                startTime: t.startTime ? new Date(t.startTime).getTime() : Date.now(),
              };
              graphState.needsRender = true;
            }
          });

          // Remove completed tasks
          Object.keys(graphState.tasks).forEach(function (tid) {
            if (!seen[tid]) {
              delete graphState.tasks[tid];
              graphState.needsRender = true;
            }
          });
        })
        .catch(function (err) {
          console.warn("Graph: failed to poll tasks:", err);
        });
    }

    // --- Periodic updates ---
    setInterval(function () {
      updateDetailTimer();
      // Update badge timers
      var badges = canvas.querySelectorAll(".graph-task-badge .timer");
      var taskIds = Object.keys(graphState.tasks);
      badges.forEach(function (el, i) {
        if (taskIds[i] && graphState.tasks[taskIds[i]]) {
          el.textContent = formatDuration(Date.now() - (graphState.tasks[taskIds[i]].startTime || Date.now()));
        }
      });
    }, 1000);

    // --- Init ---
    // Load initial nodes
    var initialNodes = window.__GRAPH_INITIAL_NODES__ || [];
    initialNodes.forEach(function (n) {
      graphState.nodes[n.nodeId] = {
        id: n.nodeId,
        name: n.nodeName,
        nodeName: n.nodeName,
        platform: n.platform,
        arch: n.arch,
        status: n.status,
        metrics: n.metrics,
        x: 0,
        y: 0,
        el: null,
      };
    });

    layoutNodes();
    render();
    animLoop();

    // Start polling tasks
    pollActiveTasks();
    setInterval(pollActiveTasks, 5000);
  }

  // --- Initialize ---
  reformatServerTimestamps();
  connectSocket();
  initGraph();
  initChat();
})();
