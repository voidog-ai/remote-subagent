# RemoteSubagent

Interconnect Claude Code instances across multiple PCs (MacBook Pro, Surface Pro 7, Windows Desktop, Ubuntu Server) to enable simultaneous server/client development. An Ubuntu server acts as the master hub, with a web dashboard for real-time monitoring and control.

## Architecture

```
              [Web Dashboard (Hono + JSX)]
              port 3200
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
| `packages/mcp-server` | MCP server (9 tools for Claude Code integration) |
| `packages/dashboard` | Web dashboard (Hono + JSX + real-time Socket.IO) |

## Setup

### 1. Install & Build

```bash
git clone https://github.com/voidog-ai/remote-subagent.git
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

# Session persistence (default: true when omitted)
SESSION_PERSISTENCE=true

# Node agent (each client PC)
NODE_ID=macbook-pro
NODE_NAME=MacBook Pro
MASTER_URL=http://your-server:3100
NODE_TOKEN=<generated-jwt-token>
CLAUDE_SKIP_PERMISSIONS=false

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

Nine tools available from within Claude Code:

| Tool | Description |
|---|---|
| `list_nodes` | List all connected agent nodes with status and metrics |
| `send_prompt` | Send a prompt to a remote Claude instance. Supports `context`, `session_id` (resume conversation), and `new_session` (force fresh) parameters |
| `execute_command` | Execute a shell command on a remote node |
| `read_remote_file` | Read a file from a remote node |
| `write_remote_file` | Write a file to a remote node |
| `broadcast_prompt` | Send the same prompt to all online nodes simultaneously |
| `cancel_task` | Cancel a running task by ID |
| `list_sessions` | List active conversation sessions (optionally filter by `node_id`) |
| `delete_session` | Delete a conversation session from tracking |

### Usage Examples

```
list_nodes
send_prompt target=macbook-pro prompt="Build the project and run tests"
execute_command target=surface-pro command="git status" cwd="/projects/app"
read_remote_file target=windows-desktop file_path="C:\Users\dev\config.json"
broadcast_prompt prompt="Report your Node.js version"
cancel_task task_id="abc-123"
```

### Session Persistence (Multi-Turn Conversations)

By default, each `send_prompt` call creates a new session and returns a session ID. Pass this ID back to resume the conversation with full history:

```
# Start a new conversation
send_prompt target=macbook-pro prompt="Let's refactor the auth module"
# Result includes: [Session: abc-123-def]

# Continue the same conversation (remote Claude remembers context)
send_prompt target=macbook-pro prompt="Now add unit tests for the changes" session_id="abc-123-def"

# Force a fresh session even with an existing session_id
send_prompt target=macbook-pro prompt="Start over" session_id="abc-123-def" new_session=true

# List all active sessions
list_sessions
list_sessions node_id=macbook-pro

# Clean up a session
delete_session session_id="abc-123-def"
```

Session persistence can be toggled via the Dashboard Settings page or the REST API (`PUT /api/settings`). When disabled, all prompts run statelessly without session tracking.

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

Access at `http://your-server:3200`. Requires `DASHBOARD_USER` and `DASHBOARD_PASSWORD` environment variables for Basic Auth.

| Page | Path | Description |
|---|---|---|
| Dashboard | `/` | Summary cards, node grid, live activity feed |
| Nodes | `/nodes` | Expandable node cards with CPU/memory/disk metrics, connection info |
| Logs | `/logs` | Real-time log stream with level/source filters, CSV export |
| Console | `/console` | Command execution (Prompt / Shell / File Read / File Write tabs) |
| Settings | `/settings` | Server info, session persistence toggle, token generation, system configuration |

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
| `SESSION_TTL_MS` | 86,400,000 | Session time-to-live (24 hours) |
| `SESSION_CLEANUP_INTERVAL_MS` | 3,600,000 | Session cleanup check interval (1 hour) |

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

### Session Persistence

```
First call (no session_id):
  -> node-agent generates UUID, spawns "claude --session-id <uuid>"
  -> Result includes sessionId -> Master registers in SessionManager
  -> MCP tool returns [Session: <uuid>] to caller

Subsequent call (with session_id):
  -> Master validates session-node affinity (SESSION_NOT_FOUND if mismatch)
  -> node-agent spawns "claude --resume <uuid>"
  -> Remote Claude has full conversation history

Session cleanup:
  -> SessionManager auto-expires sessions after 24 hours of inactivity
  -> Manual deletion via delete_session tool or DELETE /api/sessions/:id
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

## Security

### Required Secrets

The master server requires `JWT_SECRET` and `DASHBOARD_SECRET` environment variables. It will refuse to start if either is missing. Generate strong random values:

```bash
openssl rand -base64 32  # for JWT_SECRET
openssl rand -base64 32  # for DASHBOARD_SECRET
```

### Claude Code Permissions

By default, remote Claude Code instances run **with** the standard permission system. Set `CLAUDE_SKIP_PERMISSIONS=true` in the node agent's environment only if you understand the implications — this grants the remote Claude instance unrestricted file and command access on that machine.

### Dashboard Access

The dashboard exposes task execution and file operations. In production, place it behind a reverse proxy with proper authentication (e.g., Cloudflare Access, OAuth2 Proxy) in addition to the built-in Basic Auth.

### Node Agent Restrictions

Use `ALLOWED_PATHS` and `DENIED_COMMANDS` environment variables on each node agent to limit file access and block dangerous commands. See [Node Agent Configuration](#node-agent-configuration) for details.

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
