/**
 * Tiny SVG sparkline for the stats panel. Zero dependencies — takes a number
 * series and draws a polyline plus an optional filled area under the curve.
 *
 * Used by StatsDashboard to render population/gold/vault arcs over the
 * last 90 in-world days.
 */

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  /** Stroke color. Defaults to the accent CSS variable. */
  stroke?: string;
  /** Optional fill below the curve (rgba). Pass null to disable. */
  fill?: string | null;
  /** Label rendered at the right showing the latest value. */
  label?: string;
}

export function Sparkline({
  data,
  width = 90,
  height = 24,
  stroke = "var(--accent)",
  fill = "rgba(252, 211, 77, 0.15)",
  label,
}: SparklineProps) {
  if (!data.length) {
    return (
      <div className="sparkline-empty" style={{ width, height }}>
        <span>—</span>
      </div>
    );
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = data.length === 1 ? width : width / (data.length - 1);
  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const polyline = points.join(" ");
  const areaPath =
    fill && data.length > 1
      ? `M0,${height} L${points.join(" L")} L${(width).toFixed(1)},${height} Z`
      : null;
  const latest = data[data.length - 1];

  return (
    <div className="sparkline">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {areaPath && <path d={areaPath} fill={fill ?? undefined} />}
        <polyline
          points={polyline}
          fill="none"
          stroke={stroke}
          strokeWidth={1.2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      {label && (
        <span className="sparkline-label">
          {label}: <strong>{latest}</strong>
        </span>
      )}
    </div>
  );
}
