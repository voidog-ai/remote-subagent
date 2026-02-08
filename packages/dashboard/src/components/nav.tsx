import type { FC } from "hono/jsx";

interface NavProps {
  active: string;
}

export const Nav: FC<NavProps> = ({ active }) => {
  const items = [
    { path: "/", label: "Dashboard", icon: "grid" },
    { path: "/nodes", label: "Nodes", icon: "server" },
    { path: "/logs", label: "Logs", icon: "file-text" },
    { path: "/console", label: "Console", icon: "terminal" },
    { path: "/settings", label: "Settings", icon: "settings" },
  ];

  return (
    <nav class="sidebar">
      <div class="sidebar-header">
        <h1 class="sidebar-title">RemoteSubagent</h1>
        <span class="sidebar-version">v1.0.0</span>
      </div>
      <ul class="nav-list">
        {items.map((item) => (
          <li>
            <a
              href={item.path}
              class={`nav-item ${active === item.path ? "active" : ""}`}
            >
              <span class="nav-icon">{getIcon(item.icon)}</span>
              <span class="nav-label">{item.label}</span>
            </a>
          </li>
        ))}
      </ul>
      <div class="sidebar-footer">
        <div class="connection-status" id="connection-status">
          <span class="status-dot offline"></span>
          <span class="status-text">Disconnected</span>
        </div>
      </div>
    </nav>
  );
};

function getIcon(name: string): string {
  const icons: Record<string, string> = {
    grid: "\u25A6",
    server: "\u2630",
    "file-text": "\u2263",
    terminal: ">_",
    settings: "\u2699",
  };
  return icons[name] || "\u25CF";
}
