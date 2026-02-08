export const ErrorCodes = {
  TIMEOUT: "TIMEOUT",
  CANCELLED: "CANCELLED",
  NODE_OFFLINE: "NODE_OFFLINE",
  QUEUE_FULL: "QUEUE_FULL",
  EXECUTION_ERROR: "EXECUTION_ERROR",
  PATH_DENIED: "PATH_DENIED",
  COMMAND_DENIED: "COMMAND_DENIED",
  SDK_ERROR: "SDK_ERROR",
  CONNECTION_ERROR: "CONNECTION_ERROR",
  AUTH_FAILED: "AUTH_FAILED",
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
