import type { FC } from "hono/jsx";
import type { LogEntry as LogEntryType } from "@remote-subagent/shared";

interface LogEntryProps {
  entry: LogEntryType;
}

export const LogEntryRow: FC<LogEntryProps> = ({ entry }) => {
  return (
    <div class={`log-entry log-${entry.level}`}>
      <span class="log-timestamp" data-ts={entry.timestamp}>
        {entry.timestamp}
      </span>
      <span class={`log-level log-level-${entry.level}`}>
        {entry.level.toUpperCase()}
      </span>
      <span class="log-source">{entry.source}</span>
      <span class="log-event">{entry.event}</span>
      {entry.details && <span class="log-details">{entry.details}</span>}
      {entry.taskId && (
        <span class="log-task-id">{entry.taskId.slice(0, 8)}</span>
      )}
    </div>
  );
};
