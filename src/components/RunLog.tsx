"use client";

import { useEffect, useRef } from "react";
import type { HarnessEvent } from "@/lib/events";
import styles from "./RunLog.module.css";

function hhmmss(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--:--";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function describe(e: HarnessEvent): string {
  switch (e.type) {
    case "run_started":
      return `run_started  ${e.run_id}  ${e.control} @ ${e.repo}  ruleset ${e.ruleset_hash.slice(0, 8)}`;
    case "manifest_loaded":
      return `manifest_loaded  ${e.manifest_hash.slice(0, 8)}  ${e.scope_entries.length} scope exclusions · ${e.subprocessors.length} subprocessors`;
    case "stage_started":
      return `stage  ${e.stage}`;
    case "manifest_import":
      return `import  ${e.file}  ${e.package}  ${e.ecosystem}${e.known ? "" : " · unrecognized"}`;
    case "candidate_found":
      return `candidate_found  ${e.file}:${e.line}  ${e.finding_id}  ${e.source}`;
    case "file_accounted":
      return `file_accounted  ${e.file}  ${e.status}${e.scope_entry ? ` · ${e.scope_entry}` : ""}`;
    case "population_locked":
      return `population_locked  ${e.count}`;
    case "enrichment": {
      const parts = [e.disposition ?? "NEEDS_REVIEW", e.detail_code, e.severity]
        .filter(Boolean)
        .join(" · ");
      return `enrichment  ${e.finding_id}  ${parts}${e.actor === "human" ? "  (human)" : ""}`;
    }
    case "queue_item":
      return `queue_item  ${e.finding_id}  ${e.review_reason}`;
    case "scope_entry":
      return `scope_entry  ${e.finding_id}  approved_by ${e.approved_by}${e.harness_flagged ? " · harness_flagged" : ""}`;
    case "gate_status":
      return e.open
        ? "gate_status  open"
        : `gate_status  closed · ${e.blockers.length} blocker${e.blockers.length === 1 ? "" : "s"}`;
    case "run_complete":
      return `run_complete  ${e.run_id}`;
  }
}

export function RunLog({ events }: { events: HarnessEvent[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [events.length]);

  return (
    <div
      ref={scrollRef}
      className={styles.log}
      onScroll={(ev) => {
        const el = ev.currentTarget;
        pinnedRef.current =
          el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }}
    >
      {events.length === 0 ? (
        <div className={styles.empty}>awaiting events</div>
      ) : (
        events.map((e) => (
          <div key={`${e.seq}-${e.ts}`} className={styles.line}>
            <span className={styles.ts}>{hhmmss(e.ts)}</span>
            <span className={styles.msg}>{describe(e)}</span>
          </div>
        ))
      )}
    </div>
  );
}
