import type { FC } from "hono/jsx";

interface MetricBarProps {
  label: string;
  value: number;
  max: number;
  unit: string;
  color?: string;
}

export const MetricBar: FC<MetricBarProps> = ({
  label,
  value,
  max,
  unit,
  color,
}) => {
  const percent = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const barColor =
    color || (percent > 80 ? "var(--status-offline)" : percent > 60 ? "var(--status-busy)" : "var(--accent-blue)");

  return (
    <div class="metric-bar">
      <div class="metric-bar-header">
        <span class="metric-label">{label}</span>
        <span class="metric-value">
          {value.toFixed(1)}{unit} / {max.toFixed(1)}{unit}
        </span>
      </div>
      <div class="metric-bar-track">
        <div
          class="metric-bar-fill"
          style={`width: ${percent.toFixed(1)}%; background: ${barColor}`}
        />
      </div>
    </div>
  );
};
