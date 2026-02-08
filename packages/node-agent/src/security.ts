import path from "node:path";
import { createTaskError, type TaskError } from "@remote-subagent/shared";

export class SecurityValidator {
  constructor(
    private allowedPaths: string[],
    private deniedCommands: string[],
  ) {}

  validateFilePath(filePath: string): void {
    // Normalize and resolve path
    const normalized = path.resolve(path.normalize(filePath));

    // Check for path traversal
    if (filePath.includes("..")) {
      throw createTaskError(
        "PATH_DENIED",
        `Path traversal detected: ${filePath}`,
      );
    }

    // Skip validation if no allowed paths configured
    if (this.allowedPaths.length === 0) return;

    // Check if path is under any allowed path
    const isAllowed = this.allowedPaths.some((allowedPath) => {
      const normalizedAllowed = path.resolve(path.normalize(allowedPath));
      return normalized.startsWith(normalizedAllowed);
    });

    if (!isAllowed) {
      throw createTaskError(
        "PATH_DENIED",
        `Path not allowed: ${filePath}. Allowed paths: ${this.allowedPaths.join(", ")}`,
      );
    }
  }

  validateCommand(command: string): void {
    const lowerCommand = command.toLowerCase();

    for (const denied of this.deniedCommands) {
      if (lowerCommand.includes(denied.toLowerCase())) {
        throw createTaskError(
          "COMMAND_DENIED",
          `Command denied: contains "${denied}"`,
        );
      }
    }
  }
}
