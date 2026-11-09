"use client";

/**
 * Five axes, five elders. Drawn inline because the shape is the point and a
 * charting library would be more code than the geometry.
 *
 * Two polygons when a human has moved something: what the analysis said, and
 * what the reviewer says instead.
 */
export function Radar({
  axes,
  size = 260,
}: {
  axes: { label: string; ai: number; human?: number }[];
  size?: number;
}) {
  const n = axes.length;
  const cx = size / 2;
  const cy = size / 2 + 4;
  const r = size / 2 - 46;

  const point = (i: number, value: number) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const d = (Math.max(0, Math.min(100, value)) / 100) * r;
    return [cx + d * Math.cos(angle), cy + d * Math.sin(angle)] as const;
  };

  const poly = (key: "ai" | "human") =>
    axes
      .map((a, i) => {
        const v = key === "human" ? (a.human ?? a.ai) : a.ai;
        const [x, y] = point(i, v);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  const moved = axes.some((a) => a.human !== undefined && a.human !== a.ai);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Score by axis">
      {[25, 50, 75, 100].map((ring) => (
        <polygon
          key={ring}
          points={axes
            .map((_, i) => {
              const [x, y] = point(i, ring);
              return `${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(" ")}
          fill="none"
          stroke="var(--line)"
          strokeWidth={1}
        />
      ))}

      {axes.map((_, i) => {
        const [x, y] = point(i, 100);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--line)" strokeWidth={1} />;
      })}

      <polygon
        points={poly("ai")}
        fill={moved ? "rgba(138,147,166,.14)" : "rgba(47,95,208,.16)"}
        stroke={moved ? "var(--ink-3)" : "var(--accent)"}
        strokeWidth={2}
        strokeDasharray={moved ? "4 3" : undefined}
      />

      {moved && (
        <polygon
          points={poly("human")}
          fill="rgba(47,95,208,.18)"
          stroke="var(--accent)"
          strokeWidth={2.5}
        />
      )}

      {axes.map((a, i) => {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        const lx = cx + (r + 24) * Math.cos(angle);
        const ly = cy + (r + 24) * Math.sin(angle);
        const anchor = Math.abs(Math.cos(angle)) < 0.3 ? "middle" : Math.cos(angle) > 0 ? "start" : "end";
        const words = a.label.split(" ");
        const lines = words.length > 2 ? [words.slice(0, 2).join(" "), words.slice(2).join(" ")] : [a.label];
        return (
          <text
            key={a.label}
            x={lx}
            y={ly - (lines.length > 1 ? 5 : 0)}
            textAnchor={anchor}
            fontSize={11}
            fontWeight={600}
            fill="var(--ink-2)"
          >
            {lines.map((line, li) => (
              <tspan key={li} x={lx} dy={li === 0 ? 0 : 12}>
                {line}
              </tspan>
            ))}
          </text>
        );
      })}
    </svg>
  );
}
