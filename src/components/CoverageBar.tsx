import styles from "./CoverageBar.module.css";

// One-dimension coverage: population (track) → dispositioned → exceptions.
export function CoverageBar({
  population,
  dispositioned,
  exceptions,
}: {
  population: number;
  dispositioned: number;
  exceptions: number;
}) {
  const pct = (n: number) =>
    population > 0 ? `${Math.min(100, (n / population) * 100)}%` : "0%";
  return (
    <div className={styles.track} aria-hidden>
      <div className={styles.dispositioned} style={{ width: pct(dispositioned) }} />
      <div className={styles.exceptions} style={{ width: pct(exceptions) }} />
    </div>
  );
}
