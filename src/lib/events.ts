// Event schema — HANDOFF §6, with the user-approved rename: the disposition
// event and pipeline stage are "enrichment" (was "classification").
//
// Append-only facts; never mutations. No finding_updated event exists: a queue
// resolution is a new enrichment event superseding the earlier one; a scope-out
// is a new scope_entry. UI state is a fold over the log (see fold.ts).
// Three consumers, one schema: the UI renders it live; the persisted JSONL is
// the machine-readable appendix in the bundle; replaying the JSONL ships the
// pre-baked demo run.

import type {
  CandidateSource,
  DeclaredSubprocessor,
  Disposition,
  FileStatus,
  GateBlocker,
  ResolutionStatus,
  ScopeExclusion,
  Severity,
  Stage,
} from "./types";

interface Base {
  seq: number; // monotonically increasing; SSE id + polling cursor
  ts: string; // ISO 8601
}

export interface RunStartedEvent extends Base {
  type: "run_started";
  run_id: string;
  repo: string;
  control: string;
  ruleset_hash: string;
  commit: string | null; // git HEAD at scan time, "-dirty" suffixed when the tree has changes
}

export interface ManifestLoadedEvent extends Base {
  type: "manifest_loaded"; // compliance.yaml
  manifest_hash: string;
  scope_entries: ScopeExclusion[];
  subprocessors: DeclaredSubprocessor[];
}

export interface StageStartedEvent extends Base {
  type: "stage_started";
  stage: Stage;
}

export interface ManifestImportEvent extends Base {
  type: "manifest_import";
  file: string;
  package: string;
  ecosystem: "python" | "javascript";
  known: boolean; // false → network-ish name heuristic; flagged, never dropped
}

export interface CandidateFoundEvent extends Base {
  type: "candidate_found";
  finding_id: string;
  file: string;
  line: number;
  snippet: string; // the matched source line; evidence must be renderable, not just hashable
  snippet_hash: string;
  source: CandidateSource;
}

export interface FileAccountedEvent extends Base {
  type: "file_accounted";
  file: string;
  status: FileStatus;
  scope_entry?: string; // matching exclusion glob when excluded_by_scope
}

export interface PopulationLockedEvent extends Base {
  type: "population_locked"; // the thesis moment: denominator freezes before enrichment
  count: number;
}

export interface EnrichmentEvent extends Base {
  type: "enrichment";
  finding_id: string;
  disposition: Disposition | null; // null only when resolution_status is NEEDS_REVIEW
  detail_code: string | null;
  severity?: Severity | null;
  reasoning: string;
  resolution_status: ResolutionStatus;
  actor: "claude" | "human"; // provenance: Claude-with-reasoning or human-with-rationale
  note?: string | null;
  code_summary?: string | null; // plain-English "what this code does"
}

export interface QueueItemEvent extends Base {
  type: "queue_item";
  finding_id: string;
  review_reason: string;
}

export interface ScopeEntryEvent extends Base {
  type: "scope_entry"; // append-only ledger
  finding_id: string;
  level: "finding";
  rationale: string;
  approved_by: string;
  harness_flagged?: boolean; // user-asserted over Claude's pushback
  pushback?: string; // Claude's objection, preserved on the record
}

export interface GateStatusEvent extends Base {
  type: "gate_status"; // re-emitted on EVERY state change
  open: boolean;
  blockers: GateBlocker[];
}

export interface RunCompleteEvent extends Base {
  type: "run_complete";
  run_id: string;
}

export type HarnessEvent =
  | RunStartedEvent
  | ManifestLoadedEvent
  | StageStartedEvent
  | ManifestImportEvent
  | CandidateFoundEvent
  | FileAccountedEvent
  | PopulationLockedEvent
  | EnrichmentEvent
  | QueueItemEvent
  | ScopeEntryEvent
  | GateStatusEvent
  | RunCompleteEvent;

// Distributive over the union — Omit applied to the union directly would
// collapse it to the shared keys.
export type EventPayload<T extends HarnessEvent = HarnessEvent> =
  T extends HarnessEvent ? Omit<T, "seq" | "ts"> : never;

// --- JSONL codec ---

export function encodeJsonl(events: HarnessEvent[]): string {
  return events.map((e) => JSON.stringify(e)).join("\n") + "\n";
}

export function decodeJsonl(jsonl: string): HarnessEvent[] {
  return jsonl
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as HarnessEvent);
}
