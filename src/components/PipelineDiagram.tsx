"use client";

// The methodology as a live diagram: repo → network libraries → scan usage →
// Claude triage → findings, every number folded from the actual event log.

import type { RunState } from "@/lib/fold";
import styles from "./PipelineDiagram.module.css";

const MANIFEST_FILES = ["package.json", "requirements.txt", "package-lock.json"];

function registryUrl(pkg: string, ecosystem: string): string {
  return ecosystem === "python"
    ? `https://pypi.org/project/${pkg}/`
    : `https://www.npmjs.com/package/${pkg}`;
}

function ecosystemLabel(files: string[]): string {
  const langs = new Set<string>();
  for (const f of files) {
    if (f.endsWith(".py")) langs.add("Python");
    if (/\.(js|jsx|ts|tsx|mjs)$/.test(f)) langs.add("JavaScript");
  }
  return [...langs].sort().join(" · ") || "—";
}

export function PipelineDiagram({ state }: { state: RunState }) {
  const files = Object.keys(state.files);
  const manifests = files.filter((f) => MANIFEST_FILES.includes(f));

  // Unique network-capable packages with importing-file counts.
  const packages = new Map<string, { ecosystem: string; files: number }>();
  for (const imp of state.manifest_imports) {
    const cur = packages.get(imp.package);
    if (cur) cur.files += 1;
    else packages.set(imp.package, { ecosystem: imp.ecosystem, files: 1 });
  }

  const findings = state.finding_order.map((id) => state.findings[id]);
  const matchedFiles = new Set(findings.map((f) => f.file)).size;
  const excludedCandidates = findings.filter(
    (f) => f.disposition === "OUT_OF_SCOPE_SYSTEM_LEVEL",
  ).length;
  const exceptions = findings.filter((f) => f.disposition === "EXCEPTION").length;
  const conforming = findings.filter((f) => f.disposition === "CONFORMING").length;
  const review = findings.filter((f) => f.resolution_status === "NEEDS_REVIEW").length;
  const notApplicable = findings.filter(
    (f) => f.disposition === "NOT_APPLICABLE",
  ).length;
  const scopedOut = findings.filter(
    (f) =>
      f.disposition === "OUT_OF_SCOPE_SYSTEM_LEVEL" ||
      f.disposition === "OUT_OF_SCOPE_FINDING_LEVEL",
  ).length;
  const delegated = findings.filter((f) => f.disposition === "DELEGATED").length;

  return (
    <div className={styles.diagram} role="img" aria-label="Scan methodology pipeline">
      <div className={`${styles.node} ${styles.nodeWide}`}>
        <div className={styles.nodeTitle}>{state.repo ?? "—"}</div>
        <div className={styles.nodeSub}>{ecosystemLabel(files)}</div>
        <div className={styles.nodeBody}>
          <div className={styles.nodeLabel}>manifest files</div>
          {manifests.map((m) => (
            <div key={m} className={styles.mono}>
              {m}
            </div>
          ))}
          <div className={styles.nodeLabel}>state under audit</div>
          <div className={styles.mono}>
            {state.commit
              ? `commit ${state.commit.replace(/^([0-9a-f]{40})/, (m) => m.slice(0, 7))}`
              : "commit unknown"}
          </div>
          <div className={styles.mono}>{files.length} files walked</div>
        </div>
      </div>

      <div className={styles.arrow}>
        <span className={styles.arrowLabel}>manifest parse</span>
        <span aria-hidden="true">→</span>
      </div>

      <div className={styles.node}>
        <div className={styles.nodeTitle}>network libraries</div>
        <div className={styles.nodeSub}>{packages.size} detected</div>
        <div className={styles.nodeBody}>
          {[...packages.entries()].map(([pkg, info]) => (
            <div key={pkg} className={styles.pkgRow}>
              <a
                href={registryUrl(pkg, info.ecosystem)}
                target="_blank"
                rel="noreferrer"
                className={styles.pkgLink}
              >
                {pkg} ↗
              </a>
              <span className={styles.pkgMeta}>
                {info.ecosystem} · {info.files} file{info.files === 1 ? "" : "s"}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.arrow}>
        <span className={styles.arrowLabel}>
          codebase scan · ruleset v1{" "}
          {state.ruleset_hash ? state.ruleset_hash.slice(0, 8) : ""}
        </span>
        <span aria-hidden="true">→</span>
      </div>

      <div className={styles.node}>
        <div className={styles.nodeTitle}>usage</div>
        <div className={styles.nodeSub}>
          population locked at {state.population ?? "—"}
        </div>
        <div className={styles.nodeBody}>
          <div className={styles.mono}>
            {state.population ?? "—"} candidates · {matchedFiles} files
          </div>
          <div className={styles.mono}>
            {excludedCandidates} in scope exclusions
          </div>
          <div className={styles.mono}>
            compliance.yaml {state.manifest_hash ? state.manifest_hash.slice(0, 8) : "—"}
          </div>
        </div>
      </div>

      <div className={styles.arrow}>
        <span className={styles.arrowLabel}>Claude triage</span>
        <span aria-hidden="true">→</span>
      </div>

      <div className={styles.node}>
        <div className={styles.nodeTitle}>findings</div>
        <div className={styles.nodeSub}>{findings.length} total</div>
        <div className={styles.nodeBody}>
          <div className={`${styles.outcome} ${styles.exception}`}>
            {exceptions} exceptions
          </div>
          <div className={`${styles.outcome} ${styles.conforming}`}>
            {conforming} conforming
          </div>
          {delegated > 0 && (
            <div className={styles.outcome}>{delegated} delegated</div>
          )}
          {review > 0 && (
            <div className={`${styles.outcome} ${styles.review}`}>
              {review} awaiting review
            </div>
          )}
          <div className={styles.outcome}>{scopedOut} out of scope</div>
          <div className={styles.outcome}>{notApplicable} not applicable</div>
        </div>
      </div>
    </div>
  );
}
