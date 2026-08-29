import Link from "next/link";
import { CoverageBar } from "@/components/CoverageBar";
import { Eyebrow } from "@/components/Eyebrow";
import { loadRun } from "@/lib/seed";
import styles from "./library.module.css";

export const dynamic = "force-dynamic";

const INACTIVE_CONTROLS = [
  { index: "02", id: "CC6.1", name: "Logical Access" },
  { index: "03", id: "CC6.2", name: "Credential Provisioning" },
  { index: "04", id: "CC7.1", name: "Vulnerability Management" },
  { index: "05", id: "CC8.1", name: "Change Management" },
] as const;

export default async function LibraryPage() {
  const { state } = await loadRun();

  const findings = state.finding_order.map((id) => state.findings[id]);
  const population = state.population ?? findings.length;
  const dispositioned = findings.filter(
    (f) => f.resolution_status !== "NEEDS_REVIEW",
  ).length;
  const conforming = findings.filter(
    (f) => f.disposition === "CONFORMING",
  ).length;
  const exceptions = findings.filter(
    (f) => f.disposition === "EXCEPTION",
  ).length;
  const dispositionedPct =
    population > 0 ? Math.round((dispositioned / population) * 100) : 0;
  const hasRun = state.run_id !== null;

  return (
    <div>
      <section>
        <Eyebrow>Control library</Eyebrow>
        <div className={styles.list}>
          <Link href="/run" className={styles.rowActive}>
            <span className={styles.index}>01</span>
            <span className={styles.activeBody}>
              <span className={styles.name}>CC6.7 Encryption in Transit</span>
              {hasRun ? (
                <>
                  <span className={styles.stats}>
                    {population} egress points · {conforming} conforming ·{" "}
                    {exceptions} exception{exceptions === 1 ? "" : "s"} ·{" "}
                    {dispositionedPct}% assessed
                  </span>
                  <span className={styles.barWrap}>
                    <CoverageBar
                      population={population}
                      dispositioned={dispositioned}
                      exceptions={exceptions}
                    />
                  </span>
                </>
              ) : (
                <span className={styles.stats}>no run recorded</span>
              )}
            </span>
          </Link>

          {INACTIVE_CONTROLS.map((c) => (
            <div key={c.id} className={styles.rowInactive}>
              <span className={styles.index}>{c.index}</span>
              <span className={styles.name}>
                {c.id} {c.name}
              </span>
              <span className={styles.status}>not implemented</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
