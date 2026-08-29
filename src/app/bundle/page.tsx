// Evidence bundle — the terminal artifact an auditor receives.
// Gate-locked: renders nothing but the lock while any finding is NEEDS_REVIEW.

import { readFileSync } from "node:fs";
import Link from "next/link";
import type { RunState } from "@/lib/fold";
import { loadRun } from "@/lib/seed";
import { SUBPROCESSORS_PATH } from "@/lib/paths";
import type { AttestationEntry, Disposition, Finding } from "@/lib/types";
import type { HarnessEvent } from "@/lib/events";
import { PrintButton } from "./print-button";
import styles from "./bundle.module.css";

export const dynamic = "force-dynamic";

const DISPOSITION_ORDER: Disposition[] = [
  "EXCEPTION",
  "DELEGATED",
  "CONFORMING",
  "OUT_OF_SCOPE_FINDING_LEVEL",
  "OUT_OF_SCOPE_SYSTEM_LEVEL",
  "NOT_APPLICABLE",
];

const GROUP_LABELS: Record<Disposition, string> = {
  EXCEPTION: "EXCEPTIONS",
  DELEGATED: "DELEGATED",
  CONFORMING: "CONFORMING",
  OUT_OF_SCOPE_FINDING_LEVEL: "OUT OF SCOPE — FINDING LEVEL",
  OUT_OF_SCOPE_SYSTEM_LEVEL: "OUT OF SCOPE — SYSTEM LEVEL",
  NOT_APPLICABLE: "NOT APPLICABLE",
};

const COLLAPSED: Disposition[] = ["OUT_OF_SCOPE_SYSTEM_LEVEL", "NOT_APPLICABLE"];

function shortHash(h: string | null): string {
  return h ? h.slice(0, 8) : "—";
}

function groupEyebrowClass(d: Disposition): string {
  if (d === "EXCEPTION") return styles.groupEyebrowException;
  if (d === "CONFORMING") return styles.groupEyebrowConforming;
  return styles.groupEyebrowNeutral;
}

function collapsedSummary(d: Disposition, count: number): string {
  if (d === "OUT_OF_SCOPE_SYSTEM_LEVEL") {
    return `${count} candidate${count === 1 ? "" : "s"} within excluded paths — excluded from scope on the record, rationale inherited from compliance.yaml`;
  }
  return `${count} candidate${count === 1 ? "" : "s"} determined not to be instances of the controlled behavior — retained on the record as evidence of enumeration breadth`;
}

function FindingRow({ f }: { f: Finding }) {
  return (
    <div className={styles.findingRow}>
      <div className={styles.findingTop}>
        <span className={styles.findingLoc}>
          {f.file}:{f.line}
        </span>
        {f.detail_code ? (
          <span className={`${styles.chip} ${styles.chipNeutral}`}>
            {f.detail_code}
          </span>
        ) : null}
        {f.severity ? (
          <span className={`${styles.chip} ${styles.chipException}`}>
            {f.severity}
          </span>
        ) : null}
        <span className={styles.ledgerMeta}>{f.finding_id}</span>
      </div>
      {f.reasoning ? (
        <p className={styles.findingReasoning}>{f.reasoning}</p>
      ) : null}
      {f.note ? (
        <p className={styles.findingNote}>
          <span className={styles.microLabel}>NOTE</span>
          {f.note}
        </p>
      ) : null}
    </div>
  );
}

function LockedView({ state }: { state: RunState }) {
  return (
    <main className={styles.locked}>
      <div className={styles.lockedInner}>
        <p className={styles.lockedEyebrow}>EVIDENCE BUNDLE</p>
        <h1 className={styles.lockedHeadline}>The gate is closed.</h1>
        <p className={styles.lockedSub}>
          {state.run_id === null
            ? "No run recorded. The bundle renders only from a completed run whose review queue is empty."
            : "The bundle renders only when every finding has a result. Open items block export — the lock is the integrity claim."}
        </p>
        {state.gate.blockers.length > 0 ? (
          <ul className={styles.blockerList}>
            {state.gate.blockers.map((b) => (
              <li key={b.finding_id} className={styles.blockerRow}>
                <span className={styles.blockerId}>{b.finding_id}</span>
                <span className={styles.blockerReason}>{b.reason}</span>
              </li>
            ))}
          </ul>
        ) : state.run_id !== null ? (
          <p className={styles.lockedEmpty}>
            population not locked — enumeration incomplete
          </p>
        ) : (
          <p className={styles.lockedEmpty}>no blockers on record — no run</p>
        )}
        <Link href="/run" className={styles.lockedLink}>
          → return to the run
        </Link>
      </div>
    </main>
  );
}

export default async function BundlePage() {
  const { events, state } = await loadRun();

  if (!state.gate.open) {
    return <LockedView state={state} />;
  }

  return <BundleDocument state={state} events={events} />;
}

function BundleDocument({
  state,
  events,
}: {
  state: RunState;
  events: HarnessEvent[];
}) {
  const fileEntries = Object.entries(state.files);
  const filesWalked = fileEntries.length;
  const excludedFiles = fileEntries.filter(
    ([, f]) => f.status === "excluded_by_scope",
  ).length;
  const inScopeFiles = filesWalked - excludedFiles;

  const findings = state.finding_order.map((id) => state.findings[id]);
  const oosSystemCount = findings.filter(
    (f) => f.disposition === "OUT_OF_SCOPE_SYSTEM_LEVEL",
  ).length;
  const dispositioned = findings.filter(
    (f) => f.resolution_status !== "NEEDS_REVIEW",
  ).length;
  const population = state.population ?? 0;
  const unaccounted = findings.length - dispositioned;

  const claimSentence =
    `${filesWalked} files walked: ${inScopeFiles} in scope, ${excludedFiles} excluded per ` +
    `compliance.yaml (${shortHash(state.manifest_hash)}); ${findings.length} candidates found, ` +
    `of which ${oosSystemCount} within declared exclusions were excluded from scope on the ` +
    `record; ${population} egress points locked as the population; ${dispositioned} assessed; ` +
    (unaccounted === 0
      ? "nothing unaccounted."
      : `${unaccounted} unaccounted.`);

  const groups = DISPOSITION_ORDER.map((d) => ({
    disposition: d,
    items: findings.filter((f) => f.disposition === d),
  })).filter((g) => g.items.length > 0);

  let registry: AttestationEntry[] = [];
  try {
    registry = JSON.parse(
      readFileSync(SUBPROCESSORS_PATH, "utf8"),
    ) as AttestationEntry[];
  } catch {
    registry = [];
  }
  const declaredNames = new Set(
    state.declared_subprocessors.map((s) => s.name.toLowerCase()),
  );
  const declaredRows = state.declared_subprocessors.map((s) => ({
    declared: s,
    entry:
      registry.find((r) => r.name.toLowerCase() === s.name.toLowerCase()) ??
      null,
  }));
  const undeclaredRows = registry.filter(
    (r) => !declaredNames.has(r.name.toLowerCase()),
  );

  const delegatedExceptions = findings.filter(
    (f) =>
      f.detail_code === "DELEGATED_TO_SUBPROCESSOR" &&
      f.disposition === "EXCEPTION",
  );
  // Fixture-scale assumption: vendor names are matched by text against the
  // finding's reasoning/snippet, first-delegated-exception fallback — fine for
  // one declared vendor, wrong the day there are two ambiguous ones.
  function exceptionFor(name: string): Finding | null {
    const lower = name.toLowerCase();
    return (
      delegatedExceptions.find(
        (f) =>
          f.reasoning.toLowerCase().includes(lower) ||
          f.snippet.toLowerCase().includes(lower) ||
          f.file.toLowerCase().includes(lower),
      ) ??
      delegatedExceptions[0] ??
      null
    );
  }

  const enrichmentModel = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";
  const jsonlText = events.map((e) => JSON.stringify(e)).join("\n");

  return (
    <main className={styles.doc}>
      <div className={styles.page}>
        <PrintButton className={styles.printButton} />
        <header>
          <p className={styles.eyebrow}>EVIDENCE BUNDLE · SOC 2 CC6.7</p>
          <h1 className={styles.title}>
            Encryption in transit — evidence of completeness.
          </h1>
          <p className={styles.runLine}>
            run <span>{state.run_id}</span> · repo <span>{state.repo}</span>
            <br />
            started <span>{state.started_ts ?? "—"}</span> · completed{" "}
            <span>{state.completed_ts ?? "—"}</span>
          </p>
        </header>
        <section className={styles.section}>
          <p className={styles.sectionEyebrow}>COVERAGE</p>
          <div className={styles.statGrid}>
            <div>
              <div className={styles.statNum}>{filesWalked}</div>
              <div className={styles.statCap}>files walked</div>
            </div>
            <div>
              <div className={styles.statNum}>{inScopeFiles}</div>
              <div className={styles.statCap}>in scope</div>
            </div>
            <div>
              <div className={styles.statNum}>{excludedFiles}</div>
              <div className={styles.statCap}>
                excluded per compliance.yaml ({shortHash(state.manifest_hash)})
              </div>
            </div>
            <div>
              <div className={styles.statNum}>{oosSystemCount}</div>
              <div className={styles.statCap}>
                candidates within exclusions, excluded on the record
              </div>
            </div>
            <div>
              <div className={styles.statNum}>{population}</div>
              <div className={styles.statCap}>egress points found</div>
            </div>
            <div>
              <div className={styles.statNum}>{dispositioned}</div>
              <div className={styles.statCap}>assessed</div>
            </div>
          </div>
          <p className={styles.claim}>{claimSentence}</p>
        </section>
        <section className={styles.section}>
          <p className={styles.sectionEyebrow}>FINDINGS — BY RESULT</p>
          {groups.map((g) =>
            COLLAPSED.includes(g.disposition) ? (
              <div key={g.disposition} className={styles.group}>
                <div className={styles.groupHead}>
                  <span
                    className={`${styles.groupEyebrow} ${groupEyebrowClass(g.disposition)}`}
                  >
                    {GROUP_LABELS[g.disposition]}
                  </span>
                  <span className={styles.groupCount}>{g.items.length}</span>
                </div>
                <details className={styles.collapse}>
                  <summary className={styles.collapseSummary}>
                    {collapsedSummary(g.disposition, g.items.length)}
                  </summary>
                  <div className={styles.findingList}>
                    {g.items.map((f) => (
                      <FindingRow key={f.finding_id} f={f} />
                    ))}
                  </div>
                </details>
              </div>
            ) : (
              <div key={g.disposition} className={styles.group}>
                <div className={styles.groupHead}>
                  <span
                    className={`${styles.groupEyebrow} ${groupEyebrowClass(g.disposition)}`}
                  >
                    {GROUP_LABELS[g.disposition]}
                  </span>
                  <span className={styles.groupCount}>{g.items.length}</span>
                </div>
                <div className={styles.findingList}>
                  {g.items.map((f) => (
                    <FindingRow key={f.finding_id} f={f} />
                  ))}
                </div>
              </div>
            ),
          )}
        </section>
        <section className={styles.section}>
          <p className={styles.sectionEyebrow}>SCOPE LEDGER (APPEND-ONLY)</p>

          <p className={styles.ledgerBlockLabel}>SYSTEM LEVEL</p>
          <div className={styles.ledgerList}>
            {state.scope_exclusions.map((x) => (
              <div key={x.path} className={styles.ledgerRow}>
                <div className={styles.ledgerTop}>
                  <span>{x.path}</span>
                  <span className={styles.ledgerMeta}>
                    via compliance.yaml · code-reviewed
                  </span>
                </div>
                <p className={styles.ledgerRationale}>{x.rationale}</p>
              </div>
            ))}
            {state.scope_exclusions.length === 0 ? (
              <div className={styles.ledgerRow}>
                <p className={styles.ledgerRationale}>
                  no system-level exclusions declared
                </p>
              </div>
            ) : null}
          </div>

          <p className={styles.ledgerBlockLabel}>FINDING LEVEL</p>
          <div className={styles.ledgerList}>
            {state.scope_ledger.map((e, i) => (
              <div key={`${e.finding_id}-${i}`} className={styles.ledgerRow}>
                <div className={styles.ledgerTop}>
                  <span>{e.finding_id}</span>
                  <span className={styles.ledgerMeta}>
                    approved by {e.approved_by} · {e.ts}
                  </span>
                </div>
                <p className={styles.ledgerRationale}>{e.rationale}</p>
                {e.harness_flagged ? (
                  <>
                    <p className={styles.flagMarker}>
                      USER-ASSERTED · HARNESS-FLAGGED
                    </p>
                    {e.pushback ? (
                      <p className={styles.pushback}>{e.pushback}</p>
                    ) : null}
                  </>
                ) : null}
              </div>
            ))}
            {state.scope_ledger.length === 0 ? (
              <div className={styles.ledgerRow}>
                <p className={styles.ledgerRationale}>
                  no finding-level scope entries recorded
                </p>
              </div>
            ) : null}
          </div>
        </section>
        <section className={styles.section}>
          <p className={styles.sectionEyebrow}>
            SUBPROCESSORS — DECLARED vs ATTESTATION ON FILE
          </p>
          <table className={styles.subTable}>
            <thead>
              <tr>
                <th>NAME</th>
                <th>SERVICE</th>
                <th>ATTESTATION</th>
                <th>COVERS ENCRYPTION IN TRANSIT</th>
                <th>ON FILE</th>
              </tr>
            </thead>
            <tbody>
              {declaredRows.map(({ declared, entry }) => (
                <tr key={declared.name}>
                  <td>{declared.name}</td>
                  <td>{declared.service}</td>
                  <td className={styles.subMono}>
                    {entry ? entry.attestation : "none on file"}
                  </td>
                  <td className={styles.subMono}>
                    {entry
                      ? entry.covers_encryption_in_transit
                        ? "yes"
                        : "no"
                      : "no"}
                  </td>
                  <td className={styles.subMono}>
                    {entry?.on_file ? "yes" : "no"}
                  </td>
                </tr>
              ))}
              {undeclaredRows.map((r) => (
                <tr key={r.name} className={styles.subMuted}>
                  <td>{r.name}</td>
                  <td>{r.service}</td>
                  <td className={styles.subMono}>{r.attestation}</td>
                  <td className={styles.subMono}>
                    {r.covers_encryption_in_transit ? "yes" : "no"}
                  </td>
                  <td className={styles.subMono}>
                    on file · not declared by repo
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {declaredRows
            .filter(({ entry }) => entry && !entry.covers_encryption_in_transit)
            .map(({ declared }) => {
              const exc = exceptionFor(declared.name);
              return (
                <p key={declared.name} className={styles.subExceptionNote}>
                  {declared.name}&rsquo;s attestation on file does not cover
                  encryption in transit; the delegation therefore fails and is
                  recorded as an exception
                  {exc ? (
                    <>
                      {" "}
                      (<code>{exc.finding_id}</code>)
                    </>
                  ) : null}
                  .
                </p>
              );
            })}
        </section>
        <section className={styles.section}>
          <p className={styles.sectionEyebrow}>METHODOLOGY</p>
          <div className={styles.methList}>
            <div className={styles.methRow}>
              <span className={styles.methKey}>CONTROL</span>
              <span className={styles.methVal}>{state.control ?? "CC6.7"}</span>
            </div>
            <div className={styles.methRow}>
              <span className={styles.methKey}>RULESET</span>
              <span className={styles.methVal}>
                v1 · sha256 {state.ruleset_hash ?? "—"}
              </span>
            </div>
            <div className={styles.methRow}>
              <span className={styles.methKey}>COMPLIANCE.YAML</span>
              <span className={styles.methVal}>
                sha256 {state.manifest_hash ?? "—"}
              </span>
            </div>
            <div className={styles.methRow}>
              <span className={styles.methKey}>ENRICHMENT MODEL</span>
              <span className={styles.methVal}>{enrichmentModel}</span>
            </div>
            <div className={styles.methRow}>
              <span className={styles.methKey}>RUN STARTED</span>
              <span className={styles.methVal}>{state.started_ts ?? "—"}</span>
            </div>
            <div className={styles.methRow}>
              <span className={styles.methKey}>RUN COMPLETED</span>
              <span className={styles.methVal}>
                {state.completed_ts ?? "—"}
              </span>
            </div>
            <div className={styles.methRow}>
              <span className={styles.methKey}>EVENT COUNT</span>
              <span className={styles.methVal}>{events.length}</span>
            </div>
          </div>
          <p className={styles.methProse}>
            Same repository state and same ruleset reproduce the same
            population. Scope filters disposition, never enumeration.
          </p>
        </section>
        <section className={styles.section}>
          <p className={styles.sectionEyebrow}>
            APPENDIX — EVENT LOG (JSONL, APPEND-ONLY)
          </p>
          <div className={styles.jsonlBlock}>
            <pre className={styles.jsonl}>{jsonlText}</pre>
          </div>
        </section>

        <footer className={styles.docFooter}>
          <span>
            generated from the append-only event log · seq 1–{state.last_seq}
          </span>
          <span>{state.run_id}</span>
        </footer>
      </div>
    </main>
  );
}
