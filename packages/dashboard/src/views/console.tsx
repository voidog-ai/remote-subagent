import type { FC } from "hono/jsx";
import type { NodeInfo } from "@remote-subagent/shared";

interface ConsoleProps {
  nodes: NodeInfo[];
  selectedTarget?: string;
}

export const ConsoleView: FC<ConsoleProps> = ({ nodes, selectedTarget }) => {
  return (
    <div class="page-chat">
      {/* Chat header — ノード選択 */}
      <div class="chat-header">
        <div class="chat-header-left">
          <h2 class="chat-title">Console</h2>
          <span class="chat-member-count" id="chat-member-count">
            {nodes.filter(n => n.status !== "offline").length} online
          </span>
        </div>
        <div class="chat-header-right">
          <label class="chat-target-label">Send to</label>
          <select id="console-target" class="chat-target-select">
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
      </div>

      {/* Chat messages area */}
      <div class="chat-messages" id="chat-messages">
        <div class="chat-empty" id="chat-empty">
          <div class="chat-empty-icon">💬</div>
          <p>Send a prompt to start a conversation.</p>
          <p class="text-muted">Messages and responses will appear here.</p>
        </div>
      </div>

      {/* Chat input bar */}
      <div class="chat-input-bar">
        <textarea
          id="chat-input"
          class="chat-input"
          rows={1}
          placeholder="Type a message..."
        />
        <button class="chat-send-btn" id="chat-send-btn" onclick="sendChatMessage()">
          <span class="chat-send-icon">▶</span>
        </button>
      </div>
    </div>
  );
};
