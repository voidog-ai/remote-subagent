export const ErrorCodes = {
  TIMEOUT: "TIMEOUT",
  CANCELLED: "CANCELLED",
  NODE_OFFLINE: "NODE_OFFLINE",
  QUEUE_FULL: "QUEUE_FULL",
  EXECUTION_ERROR: "EXECUTION_ERROR",
  SDK_ERROR: "SDK_ERROR",
  CONNECTION_ERROR: "CONNECTION_ERROR",
  AUTH_FAILED: "AUTH_FAILED",
  SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
  UNKNOWN: "UNKNOWN",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export interface TaskError {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export function createTaskError(
  code: ErrorCode,
  message: string,
  details?: unknown,
): TaskError {
  return { code, message, ...(details !== undefined && { details }) };
}
