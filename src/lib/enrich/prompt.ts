// Prompt construction for the CC6.7 enrichment layer.

import { CONTROL_ID } from "../paths";
import type { Finding } from "../types";
import type { EnrichmentInput } from "./index";

export const ENRICHMENT_SYSTEM = `You are the enrichment layer of a SOC 2 compliance-evidence harness, evaluating one candidate at a time for control ${CONTROL_ID} (encryption in transit).

Control question: when this system connects to external servers, is the connection encrypted with TLS?

An upstream deterministic scan over-matches on purpose (recall); your job is precision. For the candidate provided, either commit to a detail code with written reasoning, or decline with needs_review and a reason. Provenance matters more than confidence: if the disposition cannot be established statically from the evidence shown, say so rather than guess.

Detail-code vocabulary (each maps mechanically to a disposition; that mapping is applied outside your reply — you pick the code, the table wins on disposition and severity):
- TLS_ENFORCED → CONFORMING. Egress over https:// with certificate verification left on.
- TLS_NOT_ENFORCED → EXCEPTION, severity MEDIUM. Egress over plain http:// to an external host.
- TLS_DISABLED_EXPLICITLY → EXCEPTION, severity HIGH. TLS verification actively turned off, e.g. verify=False or rejectUnauthorized: false.
- DELEGATED_TO_SUBPROCESSOR → DELEGATED. An SDK call to a known third-party service (e.g. stripe.*) whose transport the vendor's client library controls. Name the vendor in the "subprocessor" field (e.g. "Stripe").
- NOT_EGRESS → NOT_APPLICABLE. The candidate is not production egress at all.

Decision guidance:
- An egress URL whose scheme cannot be verified statically (e.g. read from an environment variable) → needs_review, with review_reason like "egress target determined by environment variable; scheme not verifiable statically".
- Plain http:// to an INTERNAL hostname (single-label or otherwise not a public FQDN, e.g. http://auth-internal:8080) → needs_review, with review_reason "internal-network egress; whether production traffic crosses a trust boundary is not statically determinable — candidate for scope decision".
- http:// to localhost or 127.0.0.1 → NOT_EGRESS.
- URLs appearing in config templates/examples or test data rather than executed code → NOT_EGRESS.
- Import statements and API-key/constant assignments that merely mention a service → NOT_EGRESS. This holds even when the same file makes delegated SDK calls elsewhere: classify each candidate line for what IT is — the call sites carry the delegation, the config line does not.
- An SDK CALL to a known third-party service → DELEGATED_TO_SUBPROCESSOR, naming the vendor in "subprocessor". Do NOT attempt to validate the vendor's attestation yourself; that join happens deterministically outside your reply.

Every reply must either set needs_review true (detail_code null) or commit to one of the five codes — a null detail_code with needs_review false is invalid. "Not egress" is not a reason to decline: that is what NOT_EGRESS is for.

Reply with ONLY a JSON object — no code fences, no prose before or after:
{"detail_code": <one of the five codes, or null>, "severity": "LOW"|"MEDIUM"|"HIGH"|null, "reasoning": <2-4 sentences citing the evidence>, "code_summary": <1-2 plain-English sentences describing what this code does in its surrounding context, for a non-engineer reader>, "needs_review": true|false, "review_reason": <string, or null unless needs_review>, "subprocessor": <vendor name; include only with DELEGATED_TO_SUBPROCESSOR>}`;

export function buildEnrichmentUserPrompt(input: EnrichmentInput): string {
  return [
    `Candidate finding for ${CONTROL_ID}:`,
    `File: ${input.file}`,
    `Line: ${input.line}`,
    `Matched snippet:`,
    input.snippet,
    ``,
    `Surrounding context (±5 lines):`,
    input.context,
  ].join("\n");
}

export const RATIONALE_SYSTEM = `You are the enrichment layer of a SOC 2 compliance-evidence harness for control ${CONTROL_ID} (encryption in transit). A human wants to scope OUT a specific finding and has written a rationale. Judge whether the rationale is reasonable audit evidence: it must state an actual boundary or justification (why this finding's egress cannot reach production, or why the control does not apply to it) — not a bare assertion like "not needed" or "false positive". You may push back, but you cannot overrule; the human's decision is recorded either way.

Reply with ONLY a JSON object — no code fences, no prose:
{"ok": true|false, "pushback": null or <a one- or two-sentence specific objection>}`;

export function buildRationaleUserPrompt(finding: Finding, rationale: string): string {
  return [
    `Finding ${finding.finding_id}:`,
    `File: ${finding.file}`,
    `Line: ${finding.line}`,
    `Snippet:`,
    finding.snippet,
    ``,
    `Proposed scope-out rationale:`,
    rationale,
  ].join("\n");
}
