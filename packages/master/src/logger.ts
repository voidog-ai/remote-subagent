import { randomUUID } from "node:crypto";
import type { Server as SocketIOServer } from "socket.io";
import {
  LOG_BUFFER_SIZE,
  DASHBOARD_S2C,
  type LogEntry,
  type LogLevel,
} from "@remote-subagent/shared";

export class Logger {
  private buffer: LogEntry[] = [];
  private dashboardNsp: SocketIOServer["of"] extends (
    nsp: string,
  ) => infer R
    ? R
    : never;

  constructor(private io: SocketIOServer) {
    this.dashboardNsp = io.of("/dashboard");
  }

  log(
    level: LogLevel,
    source: string,
    event: string,
    details?: string,
    taskId?: string,
  ): void {
    const entry: LogEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      level,
      source,
      event,
      ...(details && { details }),
      ...(taskId && { taskId }),
    };

    this.buffer.push(entry);
    if (this.buffer.length > LOG_BUFFER_SIZE) {
      this.buffer.shift();
    }

    // Broadcast to dashboard
    this.dashboardNsp.emit(DASHBOARD_S2C.LOG_ENTRY, entry);

    // Console output
    const prefix = `[${entry.timestamp}] [${level.toUpperCase()}] [${source}]`;
    if (level === "error") {
      console.error(`${prefix} ${event}`, details || "");
    } else if (level === "warn") {
      console.warn(`${prefix} ${event}`, details || "");
    } else if (level === "debug") {
      // Only show debug in dev
      if (process.env.NODE_ENV === "development") {
        console.debug(`${prefix} ${event}`, details || "");
      }
    } else {
      console.log(`${prefix} ${event}`, details || "");
    }
  }

  info(source: string, event: string, details?: string, taskId?: string): void {
    this.log("info", source, event, details, taskId);
  }

  warn(source: string, event: string, details?: string, taskId?: string): void {
    this.log("warn", source, event, details, taskId);
  }

  error(
    source: string,
    event: string,
    details?: string,
    taskId?: string,
  ): void {
    this.log("error", source, event, details, taskId);
  }

  debug(
    source: string,
    event: string,
    details?: string,
    taskId?: string,
  ): void {
    this.log("debug", source, event, details, taskId);
  }

  getLogs(options?: {
    level?: LogLevel;
    source?: string;
    search?: string;
    limit?: number;
  }): LogEntry[] {
    let logs = [...this.buffer];

    if (options?.level) {
      logs = logs.filter((l) => l.level === options.level);
    }
    if (options?.source) {
      logs = logs.filter((l) => l.source === options.source);
    }
    if (options?.search) {
      const search = options.search.toLowerCase();
      logs = logs.filter(
        (l) =>
          l.event.toLowerCase().includes(search) ||
          l.details?.toLowerCase().includes(search) ||
          l.taskId?.toLowerCase().includes(search),
      );
    }
    if (options?.limit) {
      logs = logs.slice(-options.limit);
    }

    return logs;
  }

  getErrorCount(): number {
    return this.buffer.filter((l) => l.level === "error").length;
  }

  getWarnCount(): number {
    return this.buffer.filter((l) => l.level === "warn").length;
  }

  clear(): void {
    this.buffer = [];
  }
}
