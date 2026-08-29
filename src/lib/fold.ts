// RunState = fold(events). The single reducer shared by every consumer:
// the server folds the log to decide gate/export; the client folds the same
// streamed events to render; the bundle renders from the same fold. All three
// provably agree because there is exactly one way to read the log.

import type { HarnessEvent } from "./events";
import type {
  DeclaredSubprocessor,
  FileStatus,
  Finding,
  GateBlocker,
  ScopeExclusion,
  Stage,
} from "./types";

export interface ScopeLedgerEntry {
  finding_id: string;
  level: "finding";
  rationale: string;
  approved_by: string;
  harness_flagged: boolean;
  pushback: string | null;
  ts: string;
}

export interface RunState {
  run_id: string | null;
  repo: string | null;
  control: string | null;
  ruleset_hash: string | null;
  commit: string | null;
  manifest_hash: string | null;
  scope_exclusions: ScopeExclusion[];
  declared_subprocessors: DeclaredSubprocessor[];
  stages_started: Stage[]; // in order; last one is current until run_complete
  manifest_imports: { file: string; package: string; ecosystem: string; known: boolean }[];
  files: Record<string, { status: FileStatus; scope_entry?: string }>;
  findings: Record<string, Finding>;
  finding_order: string[]; // candidate_found order — chronology is meaning
  population: number | null; // null until population_locked
  enriched_count: number; // findings with at least one enrichment event
  scope_ledger: ScopeLedgerEntry[];
  gate: { open: boolean; blockers: GateBlocker[] };
  complete: boolean;
  last_seq: number;
  started_ts: string | null;
  completed_ts: string | null;
}

export function initialRunState(): RunState {
  return {
    run_id: null,
    repo: null,
    control: null,
    ruleset_hash: null,
    commit: null,
    manifest_hash: null,
    scope_exclusions: [],
    declared_subprocessors: [],
    stages_started: [],
    manifest_imports: [],
    files: {},
    findings: {},
    finding_order: [],
    population: null,
    enriched_count: 0,
    scope_ledger: [],
    gate: { open: false, blockers: [] },
    complete: false,
    last_seq: 0,
    started_ts: null,
    completed_ts: null,
  };
}

// Pure per-event step. Mutates and returns `state` for cheap incremental
// client folds; call with a fresh initialRunState() to fold from scratch.
export function foldStep(state: RunState, e: HarnessEvent): RunState {
  state.last_seq = Math.max(state.last_seq, e.seq);
  switch (e.type) {
    case "run_started":
      state.run_id = e.run_id;
      state.repo = e.repo;
      state.control = e.control;
      state.ruleset_hash = e.ruleset_hash;
      state.commit = e.commit ?? null;
      state.started_ts = e.ts;
      break;
    case "manifest_loaded":
      state.manifest_hash = e.manifest_hash;
      state.scope_exclusions = e.scope_entries;
      state.declared_subprocessors = e.subprocessors;
      break;
    case "stage_started":
      state.stages_started.push(e.stage);
      break;
    case "manifest_import":
      state.manifest_imports.push({
        file: e.file,
        package: e.package,
        ecosystem: e.ecosystem,
        known: e.known,
      });
      break;
    case "candidate_found":
      if (!state.findings[e.finding_id]) {
        state.finding_order.push(e.finding_id);
      }
      state.findings[e.finding_id] = {
        finding_id: e.finding_id,
        file: e.file,
        line: e.line,
        snippet: e.snippet,
        snippet_hash: e.snippet_hash,
        source: e.source,
        disposition: null,
        detail_code: null,
        severity: null,
        reasoning: "",
        resolution_status: "NEEDS_REVIEW",
        review_reason: null,
        note: null,
        code_summary: null,
      };
      break;
    case "file_accounted":
      state.files[e.file] = {
        status: e.status,
        ...(e.scope_entry ? { scope_entry: e.scope_entry } : {}),
      };
      break;
    case "population_locked":
      state.population = e.count;
      break;
    case "enrichment": {
      const f = state.findings[e.finding_id];
      if (!f) break; // enrichment for unknown candidate: ignore, log is authoritative
      const firstEnrichment = f.disposition === null && f.reasoning === "";
      if (firstEnrichment) state.enriched_count += 1;
      f.disposition = e.disposition;
      f.detail_code = e.detail_code;
      f.severity = e.severity ?? null;
      f.reasoning = e.reasoning;
      f.resolution_status = e.resolution_status;
      if (e.resolution_status !== "NEEDS_REVIEW") f.review_reason = null;
      if (e.note !== undefined) f.note = e.note;
      if (e.code_summary != null) f.code_summary = e.code_summary; // human resolutions keep Claude's summary
      break;
    }
    case "queue_item": {
      const f = state.findings[e.finding_id];
      if (f) {
        f.resolution_status = "NEEDS_REVIEW";
        f.review_reason = e.review_reason;
      }
      break;
    }
    case "scope_entry":
      state.scope_ledger.push({
        finding_id: e.finding_id,
        level: e.level,
        rationale: e.rationale,
        approved_by: e.approved_by,
        harness_flagged: e.harness_flagged ?? false,
        pushback: e.pushback ?? null,
        ts: e.ts,
      });
      break;
    case "gate_status":
      state.gate = { open: e.open, blockers: e.blockers };
      break;
    case "run_complete":
      state.complete = true;
      state.completed_ts = e.ts;
      break;
  }
  return state;
}

export function fold(events: HarnessEvent[]): RunState {
  return events.reduce(foldStep, initialRunState());
}

// The gate is one query: zero findings with resolution_status = NEEDS_REVIEW.
// Server-side authority — the engine calls this after every append and emits
// the resulting gate_status; clients render the emitted event, never recompute.
export function computeGate(state: RunState): {
  open: boolean;
  blockers: GateBlocker[];
} {
  const blockers: GateBlocker[] = [];
  for (const id of state.finding_order) {
    const f = state.findings[id];
    if (f.resolution_status === "NEEDS_REVIEW") {
      blockers.push({
        finding_id: id,
        reason: f.review_reason ?? "awaiting enrichment",
      });
    }
  }
  return { open: blockers.length === 0 && state.population !== null, blockers };
}
