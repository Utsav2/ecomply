// Outcome assembly. Disposition + severity always derive from the
// CC67_DETAIL_CODES mapping table (never from the model), and delegation is
// resolved by the mechanical join in delegation.ts.

import { CC67_DETAIL_CODES, type CC67DetailCode } from "../types";
import { joinDelegation } from "./delegation";
import type { EnrichmentOutcome } from "./index";

export function needsReview(
  finding_id: string,
  review_reason: string,
  reasoning: string,
  code_summary: string | null = null,
  transport_failure = false,
): EnrichmentOutcome {
  return {
    finding_id,
    disposition: null,
    detail_code: null,
    severity: null,
    reasoning,
    resolution_status: "NEEDS_REVIEW",
    review_reason,
    code_summary,
    transport_failure,
    cached: false,
  };
}

export function finalizeCommitted(
  finding_id: string,
  detail_code: CC67DetailCode,
  reasoning: string,
  subprocessor: string | null,
  code_summary: string | null = null,
): EnrichmentOutcome {
  if (detail_code === "DELEGATED_TO_SUBPROCESSOR") {
    const join = joinDelegation(subprocessor);
    const joined = `${reasoning} ${join.join_note}`.trim();
    if (join.resolution_status === "NEEDS_REVIEW") {
      return needsReview(finding_id, join.review_reason ?? "delegation join failed", joined, code_summary);
    }
    return {
      finding_id,
      disposition: join.disposition,
      detail_code,
      severity: join.severity,
      reasoning: joined,
      resolution_status: "AUTO_VALIDATED",
      review_reason: null,
      code_summary,
      transport_failure: false,
      cached: false,
    };
  }

  const mapped = CC67_DETAIL_CODES[detail_code];
  return {
    finding_id,
    disposition: mapped.disposition,
    detail_code,
    severity: mapped.severity,
    reasoning,
    resolution_status: "AUTO_VALIDATED",
    review_reason: null,
    code_summary,
    transport_failure: false,
    cached: false,
  };
}
