import Link from "next/link";
import type { Finding } from "@/lib/types";
import { Chip, dispositionTone, severityTone } from "./Chip";
import styles from "./FindingsTable.module.css";

function ResultCell({ f }: { f: Finding }) {
  if (f.resolution_status === "NEEDS_REVIEW") {
    return <Chip label="NEEDS_REVIEW" tone="review" />;
  }
  if (f.disposition === null) return <span className={styles.pending}>—</span>;
  return <Chip label={f.disposition} tone={dispositionTone(f.disposition)} />;
}

export function FindingsTable({ findings }: { findings: Finding[] }) {
  if (findings.length === 0) {
    return <div className={styles.empty}>No candidates enumerated yet.</div>;
  }

  return (
    <div className={styles.table}>
      <div className={`${styles.row} ${styles.head}`}>
        <div>Location</div>
        <div>Result</div>
        <div>Detail</div>
        <div className={styles.right}>Severity</div>
      </div>
      {findings.map((f) => (
        <Link
          key={f.finding_id}
          href={`/findings/${f.finding_id}`}
          className={styles.row}
        >
          <div className={styles.path}>
            {f.file}:{f.line}
          </div>
          <div>
            <ResultCell f={f} />
          </div>
          <div>
            {f.detail_code ? (
              <Chip label={f.detail_code} tone="code" />
            ) : (
              <span className={styles.pending}>—</span>
            )}
          </div>
          <div className={styles.right}>
            {f.severity ? (
              <Chip label={f.severity} tone={severityTone(f.severity)} />
            ) : (
              <span className={styles.pending}>—</span>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
