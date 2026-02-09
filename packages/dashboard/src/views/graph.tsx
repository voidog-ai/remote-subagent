import type { FC } from "hono/jsx";
import type { NodeInfo } from "@remote-subagent/shared";

interface GraphViewProps {
  nodes: NodeInfo[];
}

export const GraphView: FC<GraphViewProps> = ({ nodes }) => {
  return (
    <div class="page-graph">
      {/* Canvas with dot grid background */}
      <div class="graph-canvas" id="graph-canvas">
        <svg class="graph-svg" id="graph-svg">
          <defs>
            <marker
              id="graph-arrow-blue"
              markerWidth="10"
              markerHeight="8"
              refX="9"
              refY="4"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <polygon points="0 0, 10 4, 0 8" fill="#3b82f6" />
            </marker>
            <marker
              id="graph-arrow-green"
              markerWidth="10"
              markerHeight="8"
              refX="9"
              refY="4"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <polygon points="0 0, 10 4, 0 8" fill="#22c55e" />
            </marker>
            <marker
              id="graph-arrow-purple"
              markerWidth="10"
              markerHeight="8"
              refX="9"
              refY="4"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <polygon points="0 0, 10 4, 0 8" fill="#7c3aed" />
            </marker>
            <marker
              id="graph-arrow-amber"
              markerWidth="10"
              markerHeight="8"
              refX="9"
              refY="4"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <polygon points="0 0, 10 4, 0 8" fill="#f59e0b" />
            </marker>
            <marker
              id="graph-arrow-gray"
              markerWidth="8"
              markerHeight="6"
              refX="7"
              refY="3"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <polygon points="0 0, 8 3, 0 6" fill="#334155" />
            </marker>
          </defs>
          <g id="graph-connections-layer"></g>
        </svg>
      </div>

      {/* Controls */}
      <div class="graph-controls" id="graph-controls">
        <button class="graph-ctrl-btn" id="graph-zoom-in" title="Zoom In">
          +
        </button>
        <button class="graph-ctrl-btn" id="graph-zoom-out" title="Zoom Out">
          -
        </button>
        <button class="graph-ctrl-btn" id="graph-fit-view" title="Fit View">
          {"["}{"]"}
        </button>
        <button
          class="graph-ctrl-btn"
          id="graph-toggle-offline"
          title="Toggle Offline Nodes"
        >
          {"O"}
        </button>
      </div>

      {/* Legend */}
      <div class="graph-legend" id="graph-legend">
        <h4>Connections</h4>
        <div class="graph-legend-item">
          <div class="graph-legend-line graph-legend-line-active"></div>
          Active task
        </div>
        <div class="graph-legend-item">
          <div class="graph-legend-line graph-legend-line-bidi"></div>
          Bidirectional
        </div>
        <div class="graph-legend-item">
          <div class="graph-legend-loop"></div>
          Self-loop
        </div>
      </div>

      {/* Status bar */}
      <div class="graph-status-bar" id="graph-status-bar">
        <div>
          <span class="graph-status-dot"></span>
          <span id="graph-sb-nodes">{nodes.length} Nodes</span>
          {" \u00b7 "}
          <span id="graph-sb-online">
            {nodes.filter((n) => n.status !== "offline").length} Online
          </span>
        </div>
        <div id="graph-sb-tasks">0 Active Tasks</div>
      </div>

      {/* Task detail overlay */}
      <div class="graph-detail-overlay" id="graph-detail-overlay">
        <div class="graph-detail-panel" id="graph-detail-panel">
          <div class="graph-detail-header">
            <h3>Task Detail</h3>
            <button class="graph-detail-close" id="graph-detail-close">
              X
            </button>
          </div>
          <div class="graph-detail-body">
            <div class="graph-detail-flow">
              <span id="graph-d-source" class="graph-detail-source">
                source
              </span>
              <span class="graph-detail-arrow">{"\u2192"}</span>
              <span id="graph-d-target" class="graph-detail-source">
                target
              </span>
            </div>
            <div class="graph-detail-meta">
              <span>
                ID: <span id="graph-d-taskid">-</span>
              </span>
              <span>
                Duration: <span id="graph-d-duration">0m 0s</span>
              </span>
              <span class="graph-detail-type-badge">prompt</span>
            </div>
            <div class="graph-detail-prompt" id="graph-d-prompt"></div>
            <label class="graph-detail-label">Live Output</label>
            <div class="graph-detail-output" id="graph-d-output"></div>
            <div class="graph-detail-actions">
              <button class="btn btn-danger" id="graph-d-cancel">
                Cancel Task
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Embed initial node data for client-side hydration */}
      <script
        dangerouslySetInnerHTML={{
          __html: `window.__GRAPH_INITIAL_NODES__ = ${JSON.stringify(nodes)};`,
        }}
      />
    </div>
  );
};
