// Pure inline SVG donut. Stroke-based arc segments with a 2px white gap
// between adjacent segments, ~62% hole, center count + caption, and a legend
// that carries identity (the legend, never color alone, names each class).

import styles from "./DonutChart.module.css";

export interface DonutSlice {
  label: string;
  count: number;
  color: string;
}

const SIZE = 148; // viewBox px
const OUTER_R = SIZE / 2;
const HOLE_RATIO = 0.68;
const STROKE_W = OUTER_R * (1 - HOLE_RATIO); // ring thickness
const R = OUTER_R - STROKE_W / 2; // stroke centerline radius
const GAP_PX = 2; // white gap between adjacent segments

function polar(angle: number): [number, number] {
  return [
    OUTER_R + R * Math.cos(angle),
    OUTER_R + R * Math.sin(angle),
  ];
}

function arcPath(a0: number, a1: number): string {
  const [x0, y0] = polar(a0);
  const [x1, y1] = polar(a1);
  const largeArc = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${x0.toFixed(3)} ${y0.toFixed(3)} A ${R} ${R} 0 ${largeArc} 1 ${x1.toFixed(3)} ${y1.toFixed(3)}`;
}

export function DonutChart({
  title,
  slices,
  centerValue,
  centerCaption,
}: {
  title: string;
  slices: DonutSlice[];
  centerValue: number;
  centerCaption: string;
}) {
  const present = slices.filter((s) => s.count > 0);
  const total = present.reduce((sum, s) => sum + s.count, 0);

  // Segment geometry: start at 12 o'clock, clockwise, half the gap shaved
  // off each side of every boundary (no gap when only one segment).
  const gapAngle = present.length > 1 ? GAP_PX / R : 0;
  let cursor = -Math.PI / 2;
  const segments = present.map((s) => {
    const sweep = (s.count / total) * 2 * Math.PI;
    let a0 = cursor + gapAngle / 2;
    let a1 = cursor + sweep - gapAngle / 2;
    cursor += sweep;
    if (a1 <= a0) {
      // Degenerate sliver: keep it visible rather than inverting.
      const mid = (a0 + a1) / 2;
      a0 = mid - 0.004;
      a1 = mid + 0.004;
    }
    const pct = Math.round((s.count / total) * 100);
    return { ...s, a0, a1, pct };
  });

  return (
    <div className={styles.card}>
      <div className={styles.title}>{title}</div>
      <div className={styles.body}>
        <div className={styles.donutWrap}>
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className={styles.donut}
            role="img"
            aria-label={`${title}: ${present
              .map((s) => `${s.label} ${s.count}`)
              .join(", ")}`}
          >
            {total === 0 ? (
              <circle
                cx={OUTER_R}
                cy={OUTER_R}
                r={R}
                fill="none"
                stroke="var(--border)"
                strokeWidth={STROKE_W}
              />
            ) : segments.length === 1 ? (
              <circle
                className={styles.segment}
                cx={OUTER_R}
                cy={OUTER_R}
                r={R}
                fill="none"
                stroke={segments[0].color}
                strokeWidth={STROKE_W}
              >
                <title>
                  {`${segments[0].label} — ${segments[0].count} finding${segments[0].count === 1 ? "" : "s"} (100%)`}
                </title>
              </circle>
            ) : (
              segments.map((s) => (
                <path
                  key={s.label}
                  className={styles.segment}
                  d={arcPath(s.a0, s.a1)}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={STROKE_W}
                  strokeLinecap="butt"
                >
                  <title>
                    {`${s.label} — ${s.count} finding${s.count === 1 ? "" : "s"} (${s.pct}%)`}
                  </title>
                </path>
              ))
            )}
          </svg>
          <div className={styles.center} aria-hidden="true">
            <div className={styles.centerValue}>{centerValue}</div>
            <div className={styles.centerCaption}>{centerCaption}</div>
          </div>
        </div>
        <ul className={styles.legend}>
          {present.map((s) => (
            <li key={s.label} className={styles.legendRow}>
              <span
                className={styles.swatch}
                style={{ background: s.color }}
                aria-hidden="true"
              />
              <span className={styles.legendLabel}>{s.label}</span>
              <span className={styles.legendCount}>{s.count}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
