import {
  SESSION_TTL_MS,
  SESSION_CLEANUP_INTERVAL_MS,
  type SessionInfo,
} from "@remote-subagent/shared";

export class SessionManager {
  private sessions = new Map<string, SessionInfo>();
  private cleanupTimer: NodeJS.Timeout;

  constructor() {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, SESSION_CLEANUP_INTERVAL_MS);
  }

  registerSession(sessionId: string, targetNodeId: string): void {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      existing.lastUsedAt = new Date().toISOString();
      existing.messageCount += 1;
    } else {
      this.sessions.set(sessionId, {
        sessionId,
        targetNodeId,
        createdAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
        messageCount: 1,
      });
    }
  }

  getSession(sessionId: string): SessionInfo | undefined {
    return this.sessions.get(sessionId);
  }

  validateSessionNode(
    sessionId: string,
    targetNodeId: string,
  ): { valid: boolean; reason?: string } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { valid: false, reason: "Session not found" };
    }
    if (session.targetNodeId !== targetNodeId) {
      return {
        valid: false,
        reason: `Session belongs to node '${session.targetNodeId}', not '${targetNodeId}'`,
      };
    }
    return { valid: true };
  }

  listSessions(nodeId?: string): SessionInfo[] {
    const all = Array.from(this.sessions.values());
    if (nodeId) {
      return all.filter((s) => s.targetNodeId === nodeId);
    }
    return all;
  }

  deleteSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      const age = now - new Date(session.lastUsedAt).getTime();
      if (age > SESSION_TTL_MS) {
        this.sessions.delete(id);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
    this.sessions.clear();
  }
}
