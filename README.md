# RemoteSubagent

Interconnect Claude Code instances across multiple PCs (MacBook Pro, Surface Pro 7, Windows Desktop, Ubuntu Server) to enable simultaneous server/client development. An Ubuntu server acts as the master hub, with a web dashboard for real-time monitoring and control.

## Architecture

```
              [Web Dashboard (Hono + JSX)]
              port 3200 / Basic Auth
                       |
              [Ubuntu Server - Master]
              port 3100 / Socket.IO + REST API
             /          |            \
       WebSocket     WebSocket     WebSocket
       (JWT Auth)    (JWT Auth)    (JWT Auth)
          /              |              \
  [MacBook Pro]   [Surface Pro 7]  [Windows Desktop]
  [Node Agent]    [Node Agent]     [Node Agent]
  [MCP Server]    [MCP Server]     [MCP Server]
  [Claude Code]   [Claude Code]    [Claude Code]
```

## Packages

| Package | Description |
|---|---|
| `packages/shared` | Shared types, Zod schemas, Socket.IO event constants |
| `packages/master` | Master server (Socket.IO + JWT auth + REST API) |
| `packages/node-agent` | Node agent (task execution, Claude process, metrics) |
| `packages/mcp-server` | MCP server (7 tools for Claude Code integration) |
| `packages/dashboard` | Web dashboard (Hono + JSX + real-time Socket.IO) |

## Setup

### 1. Install & Build

```bash
git clone <repo-url>
cd remote-subagent
npm install
npm run build
```

### 2. Environment Variables

Copy `.env.example` and configure:

```bash
cp .env.example .env
```

Required variables:

```env
# Master server (Ubuntu)
JWT_SECRET=your-strong-secret-here
DASHBOARD_SECRET=your-dashboard-secret-here

# Dashboard (Ubuntu)
DASHBOARD_PORT=3200
DASHBOARD_USER=admin
DASHBOARD_PASSWORD=your-password
MASTER_URL=http://your-server:3100

# Node agent (each client PC)
NODE_ID=macbook-pro
NODE_NAME=MacBook Pro
MASTER_URL=http://your-server:3100
NODE_TOKEN=<generated-jwt-token>

# MCP server (each client PC)
MCP_NODE_ID=macbook-pro
MCP_MASTER_URL=http://your-server:3100
MCP_TOKEN=<generated-jwt-token>
```

### 3. Generate JWT Tokens

On the master server, generate a token for each node:

```bash
# JWT_SECRET must be set in .env
npm run generate-token -- macbook-pro
npm run generate-token -- surface-pro
npm run generate-token -- windows-desktop
```

Copy the output token into each machine's `.env` as `NODE_TOKEN` and `MCP_TOKEN`.

### 4. Start Services

**Ubuntu server (master + dashboard):**

```bash
npm run start:master      # port 3100
npm run start:dashboard   # port 3200
```

**Each client machine (node agent):**

```bash
npm run start:node-agent
```

**Register MCP server with Claude Code (each client):**

```bash
claude mcp add remote-subagent -- node /path/to/remote-subagent/packages/mcp-server/dist/index.js
```

The MCP server requires `MCP_NODE_ID`, `MCP_MASTER_URL`, and `MCP_TOKEN` environment variables.

## MCP Tools

Seven tools available from within Claude Code:

| Tool | Description |
|---|---|
| `list_nodes` | List all connected agent nodes with status and metrics |
| `send_prompt` | Send a prompt to a remote Claude instance (supports `context` parameter for sharing conversation context) |
| `execute_command` | Execute a shell command on a remote node |
| `read_remote_file` | Read a file from a remote node |
| `write_remote_file` | Write a file to a remote node |
| `broadcast_prompt` | Send the same prompt to all online nodes simultaneously |
| `cancel_task` | Cancel a running task by ID |

### Usage Examples

```
list_nodes
send_prompt target=macbook-pro prompt="Build the project and run tests"
execute_command target=surface-pro command="git status" cwd="/projects/app"
read_remote_file target=windows-desktop file_path="C:\Users\dev\config.json"
broadcast_prompt prompt="Report your Node.js version"
cancel_task task_id="abc-123"
```

## Reverse Proxy Setup

When exposing the dashboard through a reverse proxy (Nginx, Caddy, etc.), you need to proxy both the dashboard and the master server's Socket.IO endpoint on the same domain. The dashboard uses Socket.IO to receive real-time updates (node status, task results, logs), and the browser must be able to reach the master's `/socket.io/` path from the same origin as the dashboard.

### Environment Variable

Set `MASTER_PUBLIC_URL` to control the Socket.IO connection URL seen by the browser:

```env
# Server-side: used by dashboard backend to proxy API calls to master
MASTER_URL=http://localhost:3100

# Browser-side: used by the browser to connect Socket.IO
# Set to empty string when using a reverse proxy on the same domain
MASTER_PUBLIC_URL=
```

When `MASTER_PUBLIC_URL` is empty, the browser connects Socket.IO to the same origin as the dashboard page (e.g., `https://remote.example.com/socket.io/`). If not set, it defaults to `MASTER_URL`.

### Nginx Example

```nginx
upstream remote_dashboard {
    server 127.0.0.1:3200;
    keepalive 64;
}

upstream remote_master {
    server 127.0.0.1:3100;   # or your MASTER_PORT
    keepalive 64;
}

server {
    listen 80;
    server_name remote.example.com;

    # Proxy Socket.IO to master server (must be before location /)
    location /socket.io/ {
        proxy_pass http://remote_master;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # All other requests to dashboard
    location / {
        proxy_pass http://remote_dashboard;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Accept-Encoding gzip;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

### Why This is Needed

The dashboard page is served by the Hono app (port 3200), but real-time events (node updates, task results, log streaming) are delivered via Socket.IO from the master server (port 3100). Without the `/socket.io/` proxy rule:

- The browser cannot load `/socket.io/socket.io.js` (the client library)
- WebSocket connections to the `/dashboard` namespace fail
- The Console page shows "Executing..." indefinitely because task results are never received

### Caddy Example

```
remote.example.com {
    handle /socket.io/* {
        reverse_proxy localhost:3100
    }
    handle {
        reverse_proxy localhost:3200
    }
}
```

## Dashboard

Access at `http://your-server:3200` (Basic Auth protected).

| Page | Path | Description |
|---|---|---|
| Dashboard | `/` | Summary cards, node grid, live activity feed |
| Nodes | `/nodes` | Expandable node cards with CPU/memory/disk metrics, connection info |
| Logs | `/logs` | Real-time log stream with level/source filters, CSV export |
| Console | `/console` | Command execution (Prompt / Shell / File Read / File Write tabs) |
| Settings | `/settings` | Server info, token generation, system configuration |

All pages update in real-time via Socket.IO.

## Node Agent Configuration

### Security

```env
# Restrict file operations to specific directories (comma-separated)
ALLOWED_PATHS=/home/user/projects,/var/log

# Block specific command patterns (comma-separated)
DENIED_COMMANDS=rm -rf /,shutdown,reboot,mkfs
```

When `ALLOWED_PATHS` is empty, file path restrictions are disabled.

### Cross-Platform

```env
# Shell configuration (platform-dependent)
DEFAULT_SHELL=/bin/bash          # macOS / Linux
DEFAULT_SHELL=cmd.exe            # Windows (default)
DEFAULT_SHELL=powershell.exe     # Windows PowerShell
```

File paths are treated as absolute paths on the target machine and normalized by the receiving node agent.

## System Constants

| Constant | Value | Description |
|---|---|---|
| `HEARTBEAT_INTERVAL_MS` | 10,000 | Heartbeat interval (includes metrics) |
| `MCP_HEARTBEAT_INTERVAL_MS` | 30,000 | MCP connection heartbeat interval |
| `MCP_TTL_MS` | 60,000 | MCP connection time-to-live |
| `SOCKET_MAX_BUFFER_SIZE` | 50 MB | Socket.IO max message size |
| `DEFAULT_TASK_TIMEOUT_MS` | 300,000 | Default task timeout (5 min) |
| `MAX_QUEUE_SIZE` | 10 | Max queued tasks per node |
| `LOG_BUFFER_SIZE` | 10,000 | Circular log buffer capacity |
| `TASK_RESULT_MAX_LENGTH` | 500 KB | Max result payload size |

## Communication Flows

### Task Execution

```
MacBook Claude Code
  -> MCP tool "send_prompt"
  -> MCP Server -> Socket.IO -> Master Router
    -> Target offline -> NODE_OFFLINE error returned immediately
    -> Target online  -> Forwarded to node-agent
      -> Enqueued in TaskQueue (QUEUE_FULL error if full)
      -> Executed when ready -> Result flows back: Master -> MCP -> Claude Code
```

### Task Cancellation

```
cancel_task / Dashboard / Timeout
  -> Master Router -> TASK_CANCEL -> node-agent
  -> AbortController.abort() -> CANCELLED result returned
```

### Master Restart Recovery

```
Master restarts -> node-agents auto-reconnect (exponential backoff)
  -> Each agent re-sends AUTHENTICATE with full node info
  -> Master performs idempotent re-registration
```

## TLS Support

For use outside a LAN, enable TLS via environment variables:

```env
TLS_CERT_PATH=/path/to/cert.pem
TLS_KEY_PATH=/path/to/key.pem
```

When unset, the server starts in plain HTTP mode.

## Development

```bash
# Development mode (hot-reload via tsx)
npm run dev:master
npm run dev:dashboard
npm run dev:node-agent

# Build individual packages
npm run build:shared
npm run build:master

# Build all packages
npm run build
```

## Tech Stack

- TypeScript (ESM), npm workspaces monorepo
- Socket.IO (WebSocket, auto-reconnection, 50MB buffer)
- jose (JWT authentication)
- @modelcontextprotocol/sdk (MCP Server, stdio transport)
- Hono + JSX (Web dashboard)
- Zod (message validation)
