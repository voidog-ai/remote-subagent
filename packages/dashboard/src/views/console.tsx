import type { FC } from "hono/jsx";
import type { NodeInfo } from "@remote-subagent/shared";

interface ConsoleProps {
  nodes: NodeInfo[];
  selectedTarget?: string;
}

export const ConsoleView: FC<ConsoleProps> = ({ nodes, selectedTarget }) => {
  return (
    <div class="page-chat">
      {/* Chat header */}
      <div class="chat-header">
        <div class="chat-header-left">
          <h2 class="chat-title">AI Chat</h2>
          <span class="chat-member-count" id="chat-member-count">
            {nodes.filter((n) => n.status !== "offline").length} online
          </span>
        </div>
      </div>

      {/* Chat messages area */}
      <div class="chat-messages" id="chat-messages">
        <div class="chat-loading" id="chat-loading">Loading history...</div>
      </div>

      {/* Chat input bar — target selector inline */}
      <div class="chat-input-bar">
        <select id="console-target" class="chat-target-inline">
          <option value="all">All Nodes</option>
          {nodes.map((node) => (
            <option
              value={node.nodeId}
              selected={selectedTarget === node.nodeId}
              disabled={node.status === "offline"}
            >
              {node.status === "offline" ? "\u25CB" : "\u25CF"}{" "}
              {node.nodeName}
              {node.status === "offline" ? " [offline]" : ""}
            </option>
          ))}
        </select>
        <textarea
          id="chat-input"
          class="chat-input"
          rows={1}
          placeholder="Type a message... (Shift+Enter to send)"
        />
        <button
          class="chat-send-btn"
          id="chat-send-btn"
          onclick="sendChatMessage()"
        >
          <span class="chat-send-icon">{"\u25B6"}</span>
        </button>
      </div>
    </div>
  );
};
