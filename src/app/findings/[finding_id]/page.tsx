import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { Chip, dispositionTone, severityTone } from "@/components/Chip";
import { Eyebrow } from "@/components/Eyebrow";
import { FIXTURE_DIR } from "@/lib/paths";
import { loadRun } from "@/lib/seed";
import type { Finding } from "@/lib/types";
import styles from "./finding.module.css";

export const dynamic = "force-dynamic";

const CONTEXT_LINES = 15;

function codeSummaryText(finding: Finding): string {
  if (finding.code_summary) return finding.code_summary;
  if (finding.disposition === "OUT_OF_SCOPE_SYSTEM_LEVEL") {
    return "Not assessed individually — this candidate sits inside a declared scope exclusion.";
  }
  return "No summary recorded.";
}

function provenanceText(finding: Finding): string {
  switch (finding.resolution_status) {
    case "AUTO_VALIDATED":
      return "Assessed by Claude · AUTO_VALIDATED";
    case "RESOLVED":
      return "Resolved by Cathy Compliance · RESOLVED";
    case "NEEDS_REVIEW":
      return "Assessed by Claude · awaiting human review";
  }
}

export default async function FindingPage({
  params,
}: {
  params: Promise<{ finding_id: string }>;
}) {
  const { finding_id } = await params;
  const { state } = await loadRun();
  const finding: Finding | undefined = state.findings[finding_id];

  if (!finding) {
    return (
      <div className={styles.notFound}>
        <p className={styles.notFoundTitle}>Finding not found</p>
        <p className={styles.notFoundBody}>
          No finding with id <span className="mono">{finding_id}</span> exists
          in the current run.
        </p>
        <Link href="/run" className={styles.backLink}>
          ← All findings
        </Link>
      </div>
    );
  }

  // Read the fixture source for the code viewer. `finding.file` must be a key
  // of state.files (findings only reference walked files) — this also rules
  // out any path traversal, since walked paths are repo-relative.
  let codeLines: { no: number; text: string }[] | null = null;
  if (finding.file in state.files) {
    try {
      const raw = await readFile(
        path.join(FIXTURE_DIR, finding.file),
        "utf8",
      );
      const all = raw.replace(/\n$/, "").split("\n");
      const start = Math.max(1, finding.line - CONTEXT_LINES);
      const end = Math.min(all.length, finding.line + CONTEXT_LINES);
      codeLines = [];
      for (let n = start; n <= end; n++) {
        codeLines.push({ no: n, text: all[n - 1] ?? "" });
      }
    } catch {
      codeLines = null; // file unreadable: fall back to the recorded snippet
    }
  }

  const isNeedsReview = finding.resolution_status === "NEEDS_REVIEW";

  // For findings inside a declared exclusion, show the exact compliance.yaml
  // lines that exclude them — the boundary is evidence too.
  const scopeGlob = state.files[finding.file]?.scope_entry ?? null;
  let scopeYamlLines: { no: number; text: string }[] | null = null;
  if (finding.disposition === "OUT_OF_SCOPE_SYSTEM_LEVEL" && scopeGlob) {
    try {
      const raw = await readFile(path.join(FIXTURE_DIR, "compliance.yaml"), "utf8");
      const all = raw.replace(/\n$/, "").split("\n");
      const hit = all.findIndex((l) => l.includes(`"${scopeGlob}"`));
      if (hit !== -1) {
        const start = hit;
        const end = Math.min(all.length - 1, hit + 1); // the path line + its rationale line
        scopeYamlLines = [];
        for (let n = start; n <= end; n++) {
          scopeYamlLines.push({ no: n + 1, text: all[n] ?? "" });
        }
      }
    } catch {
      scopeYamlLines = null;
    }
  }

  return (
    <div>
      <Link href="/run" className={styles.backLink}>
        ← All findings
      </Link>

      <div className={styles.topRow}>
        <div className={styles.identity}>
          <h1 className={styles.pageTitle}>
            {finding.file}:{finding.line}
          </h1>
          <div className={styles.ids}>
            {finding.finding_id} · {finding.snippet_hash.slice(0, 12)}
          </div>
          <div className={styles.chips}>
            {isNeedsReview ? (
              <Chip label="NEEDS_REVIEW" tone="review" />
            ) : finding.disposition !== null ? (
              <Chip
                label={finding.disposition}
                tone={dispositionTone(finding.disposition)}
              />
            ) : null}
            {finding.detail_code && (
              <Chip label={finding.detail_code} tone="code" />
            )}
            {finding.severity && (
              <Chip
                label={finding.severity}
                tone={severityTone(finding.severity)}
              />
            )}
          </div>
        </div>
        <button
          type="button"
          className={styles.exportButton}
          aria-disabled="true"
          tabIndex={-1}
          title="Not implemented"
        >
          Export control evidence
        </button>
      </div>

      <section className={styles.section}>
        <Eyebrow>Source</Eyebrow>
        <div className={styles.codeCard}>
          <div className={styles.codeHeader}>
            {finding.file}
          </div>
          <div className={styles.codeScroll}>
            {codeLines ? (
              <table className={styles.codeTable}>
                <tbody>
                  {codeLines.map((l) => (
                    <tr
                      key={l.no}
                      className={
                        l.no === finding.line ? styles.lineHit : undefined
                      }
                    >
                      <td className={styles.lineNo}>{l.no}</td>
                      <td className={styles.lineText}>
                        <pre className={styles.linePre}>{l.text || " "}</pre>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <pre className={styles.snippetFallback}>{finding.snippet}</pre>
            )}
          </div>
        </div>
      </section>

      {scopeYamlLines && (
        <section className={styles.section}>
          <Eyebrow>Excluded by declared scope</Eyebrow>
          <div className={styles.codeCard}>
            <div className={styles.codeHeader}>compliance.yaml</div>
            <div className={styles.codeScroll}>
              <table className={styles.codeTable}>
                <tbody>
                  {scopeYamlLines.map((l) => (
                    <tr key={l.no}>
                      <td className={styles.lineNo}>{l.no}</td>
                      <td className={styles.lineText}>
                        <pre className={styles.linePre}>{l.text || " "}</pre>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className={styles.proseMuted}>
            Scope changes go through code review — the exclusion, not this tool,
            is the accountable decision.
          </p>
        </section>
      )}

      <section className={styles.section}>
        <Eyebrow>What this code does</Eyebrow>
        <p className={styles.prose}>{codeSummaryText(finding)}</p>
      </section>

      <section className={styles.section}>
        <Eyebrow>Why this result</Eyebrow>
        {finding.reasoning ? (
          <p className={styles.prose}>{finding.reasoning}</p>
        ) : (
          <p className={styles.proseMuted}>No reasoning recorded yet.</p>
        )}
        {isNeedsReview && finding.review_reason && (
          <div className={styles.reviewCallout}>{finding.review_reason}</div>
        )}
        {finding.note && (
          <p className={styles.note}>
            <span className={styles.noteLabel}>note</span> {finding.note}
          </p>
        )}
        <p className={styles.provenance}>{provenanceText(finding)}</p>
      </section>
    </div>
  );
}
