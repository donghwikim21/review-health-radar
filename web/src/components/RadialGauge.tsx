interface Props {
  value: number; // 0..1
  size?: number;
  label?: string;
}

function colorFor(value: number): string {
  if (value >= 0.66) return "#2fbf71";
  if (value >= 0.4) return "#e0a300";
  return "#e5484d";
}

/** Circular confidence gauge (SVG donut) with the value in the center. */
export function RadialGauge({ value, size = 104, label }: Props) {
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  const color = colorFor(v);

  return (
    <div className="gauge" style={{ width: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" className="gauge-value" fill={color}>
          {v.toFixed(2)}
        </text>
      </svg>
      {label && <div className="gauge-label">{label}</div>}
    </div>
  );
}
