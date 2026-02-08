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
