interface Props {
  values: (number | null)[];
  width?: number;
  height?: number;
  color?: string;
}

/** Dependency-free inline-SVG sparkline. Nulls are skipped (gaps in the line). */
export function Sparkline({ values, width = 96, height = 28, color = "#6ea8fe" }: Props) {
  const points = values
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v !== null);
  if (points.length < 2) return <svg width={width} height={height} aria-hidden />;

  const vs = points.map((p) => p.v);
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const span = max - min || 1;
  const pad = 2;
  const n = values.length - 1 || 1;

  const coords = points.map((p) => {
    const x = pad + (p.i / n) * (width - 2 * pad);
    const y = height - pad - ((p.v - min) / span) * (height - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = coords[coords.length - 1]!.split(",");

  return (
    <svg width={width} height={height} aria-hidden className="sparkline">
      <polyline points={coords.join(" ")} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={2} fill={color} />
    </svg>
  );
}
