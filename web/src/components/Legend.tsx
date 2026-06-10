/** A compact legend so a reviewer understands the cards without narration. */
export function Legend() {
  return (
    <div className="legend muted small">
      <span><strong>n</strong> = sample size</span>
      <span><strong>z</strong> = std-devs vs. the 3 prior windows</span>
      <span><span className="tag tag-anomaly">anomaly</span> = |z| ≥ 2</span>
      <span><span className="tag tag-low">low n</span> = too few to trust</span>
      <span>sparkline = signal over the window, split into buckets</span>
    </div>
  );
}
