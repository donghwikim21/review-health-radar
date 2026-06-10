interface Axis {
  label: string;
  value: number; // 0..100
}

interface Props {
  axes: Axis[];
  size?: number;
}

/** Inline-SVG radar/spider chart — multidimensional, deliberately not one number. */
export function RadarChart({ axes, size = 200 }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2 - 30;
  const n = axes.length;
  const angle = (i: number): number => -Math.PI / 2 + (i / n) * 2 * Math.PI;

  const point = (i: number, r: number): [number, number] => [cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))];

  const ring = (frac: number): string =>
    axes.map((_, i) => point(i, maxR * frac).map((v) => v.toFixed(1)).join(",")).join(" ");

  const valuePoly = axes.map((a, i) => point(i, maxR * (Math.max(0, Math.min(100, a.value)) / 100)).map((v) => v.toFixed(1)).join(",")).join(" ");

  return (
    <svg width={size} height={size} className="radar" aria-hidden>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={ring(f)} className="radar-grid" />
      ))}
      {axes.map((_, i) => {
        const [x, y] = point(i, maxR);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} className="radar-spoke" />;
      })}
      <polygon points={valuePoly} className="radar-area" />
      {axes.map((a, i) => {
        const [x, y] = point(i, maxR + 14);
        return (
          <text key={a.label} x={x} y={y} className="radar-label" textAnchor="middle" dominantBaseline="middle">
            {a.label}
          </text>
        );
      })}
    </svg>
  );
}
