// Shared types — HANDOFF §5, with user-approved renames (classification → enrichment).

export type Disposition =
  | "CONFORMING" // meets the control's requirement
  | "EXCEPTION" // violates the control's requirement
  | "DELEGATED" // inherited from a third party; conforming iff attestation covers it
  | "OUT_OF_SCOPE_SYSTEM_LEVEL" // declared boundary (compliance.yaml exclusion)
  | "OUT_OF_SCOPE_FINDING_LEVEL" // per-item scope-out, rationale approved
  | "NOT_APPLICABLE"; // false positive; candidate wasn't an instance of the controlled behavior

export type Severity = "LOW" | "MEDIUM" | "HIGH";

export type ResolutionStatus = "AUTO_VALIDATED" | "NEEDS_REVIEW" | "RESOLVED";

export type CandidateSource = "manifest" | "term_scan";

export interface Finding {
  finding_id: string;
  file: string;
  line: number;
  snippet: string;
  snippet_hash: string; // sha256 of snippet; also the enrichment cache key
  source: CandidateSource;
  disposition: Disposition | null;
  detail_code: string | null; // control-specific vocabulary
  severity: Severity | null; // EXCEPTION only; verify=False is HIGH
  reasoning: string; // Claude's written reasoning (or human rationale on resolution)
  resolution_status: ResolutionStatus;
  review_reason: string | null; // free text; why it needs review
  note: string | null; // optional tickmark note, renders in bundle and on the ledger
  code_summary: string | null; // plain-English "what this code does", for the drilldown
}

// CC6.7 detail-code vocabulary — a control = an enumeration strategy + a
// detail-code vocabulary + a mapping into the six generic outcomes.
export const CC67_DETAIL_CODES = {
  TLS_ENFORCED: { disposition: "CONFORMING", severity: null },
  TLS_NOT_ENFORCED: { disposition: "EXCEPTION", severity: "MEDIUM" },
  TLS_DISABLED_EXPLICITLY: { disposition: "EXCEPTION", severity: "HIGH" },
  DELEGATED_TO_SUBPROCESSOR: { disposition: "DELEGATED", severity: null },
  NOT_EGRESS: { disposition: "NOT_APPLICABLE", severity: null },
} as const satisfies Record<
  string,
  { disposition: Disposition; severity: Severity | null }
>;

export type CC67DetailCode = keyof typeof CC67_DETAIL_CODES;

export interface ScopeExclusion {
  path: string; // glob, e.g. "vendor/**"
  rationale: string;
}

export interface DeclaredSubprocessor {
  name: string;
  service: string;
}

// Parsed compliance.yaml — exactly these keys; nothing speculative.
export interface ComplianceManifest {
  version: number;
  scope: { exclusions: ScopeExclusion[] };
  subprocessors: DeclaredSubprocessor[];
}

// Platform-side attestation registry entry (subprocessors.json).
export interface AttestationEntry {
  name: string;
  service: string;
  attestation: string;
  covers_encryption_in_transit: boolean;
  on_file: boolean;
}

export type FileStatus = "scanned" | "matched" | "excluded_by_scope";

export type Stage = "manifest" | "term_scan" | "accounting" | "enrichment";

export interface GateBlocker {
  finding_id: string;
  reason: string;
}
