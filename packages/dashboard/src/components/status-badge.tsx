import type { FC } from "hono/jsx";

interface StatusBadgeProps {
  status: string;
}

export const StatusBadge: FC<StatusBadgeProps> = ({ status }) => {
  return <span class={`badge badge-${status}`}>{status}</span>;
};
