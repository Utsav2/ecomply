"use client";

import { useEffect, useRef, useState } from "react";
import { DonutChart, type DonutSlice } from "@/components/DonutChart";
import { Eyebrow } from "@/components/Eyebrow";
import { FindingsTable } from "@/components/FindingsTable";
import { GateButton } from "@/components/GateButton";
import { Markdown } from "@/components/Markdown";
import { PipelineDiagram } from "@/components/PipelineDiagram";
import { QueueCard } from "@/components/QueueCard";
import { RunLog } from "@/components/RunLog";
import { useRunStream } from "@/components/useRunStream";
import type { Disposition } from "@/lib/types";
import styles from "./run.module.css";

const CONTROL_LANGUAGE =
  "SOC 2 CC6.7 requires that data transmitted to and from the system is protected during transmission. This run tests one dimension of that requirement: does every outbound connection this repository makes use TLS? The deterministic scan enumerates every egress point — application code, containers, deploy scripts, configuration — and each candidate is then assessed and given a result with written reasoning.";

// CVD-validated categorical palette — the legend, not color, carries identity.
const RESULT_SLICES: { label: string; dispositions: Disposition[]; color: string }[] = [
  { label: "CONFORMING", dispositions: ["CONFORMING"], color: "#067647" },
  { label: "DELEGATED", dispositions: ["DELEGATED"], color: "#2B6CB0" },
  { label: "EXCEPTION", dispositions: ["EXCEPTION"], color: "#B42318" },
  {
    label: "OUT OF SCOPE",
    dispositions: ["OUT_OF_SCOPE_SYSTEM_LEVEL", "OUT_OF_SCOPE_FINDING_LEVEL"],
    color: "#B07219",
  },
  { label: "NOT APPLICABLE", dispositions: ["NOT_APPLICABLE"], color: "#7E5BC2" },
];

type RunTab = "findings" | "review" | "log";

export default function RunPage() {
  const { state, events, connected, rerun } = useRunStream();
  const [rerunning, setRerunning] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [tab, setTab] = useState<RunTab>("findings");
  const summaryFetchedForRef = useRef<string | null>(null);

  const findings = state.finding_order.map((id) => state.findings[id]);
  // Most severe first: HIGH/MEDIUM/LOW exceptions, then items awaiting review,
  // then everything else by result group; ties break on location.
  const severityRank = (f: (typeof findings)[number]): number => {
    if (f.severity === "HIGH") return 0;
    if (f.severity === "MEDIUM") return 1;
    if (f.severity === "LOW") return 2;
    if (f.resolution_status === "NEEDS_REVIEW") return 3;
    if (f.disposition === "DELEGATED") return 4;
    if (f.disposition === "CONFORMING") return 5;
    if (f.disposition === "OUT_OF_SCOPE_FINDING_LEVEL") return 6;
    if (f.disposition === "OUT_OF_SCOPE_SYSTEM_LEVEL") return 7;
    return 8;
  };
  const sortedFindings = [...findings].sort(
    (a, b) =>
      severityRank(a) - severityRank(b) ||
      a.file.localeCompare(b.file) ||
      a.line - b.line,
  );
  const queue = state.complete
    ? findings.filter((f) => f.resolution_status === "NEEDS_REVIEW")
    : [];
  const reviewCount = queue.length;

  // Fetch the AI summary once per completed run (re-runs get a fresh one:
  // the run_id changes, so the ref no longer matches).
  useEffect(() => {
    if (!state.complete || state.run_id === null) return;
    if (summaryFetchedForRef.current === state.run_id) return;
    summaryFetchedForRef.current = state.run_id;
    setSummary(null);
    let cancelled = false;
    fetch("/api/summary", { cache: "no-store" })
      .then((res) => res.json() as Promise<{ summary: string }>)
      .then((data) => {
        if (!cancelled) setSummary(data.summary);
      })
      .catch(() => {
        // leave the loading state; a re-run or reload retries
      });
    return () => {
      cancelled = true;
    };
  }, [state.complete, state.run_id]);

  const handleRerun = async () => {
    if (rerunning) return;
    setRerunning(true);
    try {
      await rerun();
    } finally {
      setRerunning(false);
    }
  };

  // Chart 1: findings that carry a disposition, grouped per the fixed
  // adjacency order. Review-pending findings appear only in chart 2.
  const withDisposition = findings.filter((f) => f.disposition !== null);
  const resultSlices: DonutSlice[] = RESULT_SLICES.map((s) => ({
    label: s.label,
    color: s.color,
    count: withDisposition.filter(
      (f) => f.disposition !== null && s.dispositions.includes(f.disposition),
    ).length,
  }));

  const reviewSlices: DonutSlice[] = [
    {
      label: "AUTO_VALIDATED",
      color: "#2B6CB0",
      count: findings.filter((f) => f.resolution_status === "AUTO_VALIDATED")
        .length,
    },
    {
      label: "RESOLVED",
      color: "#067647",
      count: findings.filter((f) => f.resolution_status === "RESOLVED").length,
    },
    {
      label: "NEEDS_REVIEW",
      color: "#B54708",
      count: findings.filter((f) => f.resolution_status === "NEEDS_REVIEW")
        .length,
    },
  ];

  const streaming = !state.complete && events.length > 0;

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>CC6.7 · Encryption in transit</h1>
          <p className={styles.controlLanguage}>{CONTROL_LANGUAGE}</p>
        </div>
        <div className={styles.headerActions}>
          {streaming && (
            <span className={styles.live}>
              <span className={styles.liveDot} aria-hidden="true" />
              {connected ? "live" : "reconnecting"}
            </span>
          )}
          <button
            type="button"
            className={styles.rerunButton}
            onClick={() => void handleRerun()}
            disabled={rerunning}
          >
            Re-run
          </button>
          <GateButton open={state.gate.open} blockers={state.gate.blockers} />
        </div>
      </div>

      {!state.complete && state.stages_started.includes("enrichment") && (
        <div className={styles.enrichProgress}>
          enrichment {state.enriched_count}/{state.population ?? "—"}
        </div>
      )}

      <section className={styles.section}>
        <Eyebrow>Methodology</Eyebrow>
        <PipelineDiagram state={state} />
      </section>

      <section className={styles.section}>
        <Eyebrow>Summary</Eyebrow>
        <div className={styles.summaryCard}>
          {summary !== null ? (
            <div className={styles.summaryText}>
              <Markdown text={summary} />
            </div>
          ) : (
            <p className={styles.summaryLoading}>Summarizing findings…</p>
          )}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.chartRow}>
          <DonutChart
            title="Findings by result"
            slices={resultSlices}
            centerValue={withDisposition.length}
            centerCaption="assessed"
          />
          <DonutChart
            title="Review status"
            slices={reviewSlices}
            centerValue={findings.length}
            centerCaption="findings"
          />
        </div>
      </section>

      <section className={styles.section}>
        <div role="tablist" aria-label="Run detail" className={styles.tabBar}>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "findings"}
            className={tab === "findings" ? styles.tabActive : styles.tab}
            onClick={() => setTab("findings")}
          >
            Findings
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "review"}
            className={tab === "review" ? styles.tabActive : styles.tab}
            onClick={() => setTab("review")}
          >
            Needs review
            {reviewCount > 0 && (
              <span className={styles.tabCount}>{reviewCount}</span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "log"}
            className={tab === "log" ? styles.tabActive : styles.tab}
            onClick={() => setTab("log")}
          >
            Run log
          </button>
        </div>

        {/* panels stay mounted so queue-card form state and log autoscroll
            survive tab switches; inactive panels are hidden with CSS */}
        <div
          role="tabpanel"
          className={styles.tabPanel}
          hidden={tab !== "findings"}
        >
          <FindingsTable findings={sortedFindings} />
        </div>
        <div
          role="tabpanel"
          className={styles.tabPanel}
          hidden={tab !== "review"}
        >
          {state.complete && queue.length > 0 ? (
            <div className={styles.queue}>
              {queue.map((f) => (
                <QueueCard key={f.finding_id} finding={f} />
              ))}
            </div>
          ) : (
            <div className={styles.tabEmpty}>
              {state.complete
                ? "No findings awaiting review."
                : "Run in progress — the review queue opens when enrichment completes."}
            </div>
          )}
        </div>
        <div role="tabpanel" className={styles.tabPanel} hidden={tab !== "log"}>
          <RunLog events={events} />
        </div>
      </section>
    </div>
  );
}
