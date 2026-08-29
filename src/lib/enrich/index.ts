// Claude enrichment layer for CC6.7 — precision over the deterministic scan's
// recall. One call per candidate, written reasoning per finding. Output is
// either (disposition + AUTO_VALIDATED) or (NEEDS_REVIEW + why it could not
// decide); provenance matters more than confidence.

import { CC67_DETAIL_CODES, type CC67DetailCode, type Disposition, type Severity } from "../types";
import { cacheKey, lookupCache } from "./cache";
import { askStrictJson, hasApiKey } from "./model";
import { finalizeCommitted, needsReview } from "./outcome";
import { buildEnrichmentUserPrompt, ENRICHMENT_SYSTEM } from "./prompt";

export { cacheKey, persistCacheEntry } from "./cache";
export { checkScopeOutRationale } from "./rationale";

export interface EnrichmentInput {
  finding_id: string;
  file: string;
  line: number;
  snippet: string;
  snippet_hash: string;
  context: string; // ±5 surrounding source lines
}

export interface EnrichmentOutcome {
  finding_id: string;
  disposition: Disposition | null; // null iff NEEDS_REVIEW
  detail_code: string | null; // from CC67_DETAIL_CODES, null iff NEEDS_REVIEW
  severity: Severity | null;
  reasoning: string;
  resolution_status: "AUTO_VALIDATED" | "NEEDS_REVIEW";
  review_reason: string | null; // set iff NEEDS_REVIEW
  code_summary: string | null; // plain-English "what this code does", for the drilldown
  transport_failure: boolean; // call/parse failure, not a judgment — never cached
  cached: boolean;
}

export async function enrichCandidate(input: EnrichmentInput): Promise<EnrichmentOutcome> {
  const hit = lookupCache(cacheKey(input.file, input.snippet_hash));
  if (hit) return { ...hit, finding_id: input.finding_id, cached: true };

  // No key and no cached judgment: decline honestly rather than guess —
  // provenance matters more than confidence.
  if (!hasApiKey()) {
    return needsReview(
      input.finding_id,
      "no API key and no cached judgment for this snippet; requires a live enrichment run or human review",
      "Enrichment was not performed: the harness had no Anthropic API key and no recorded judgment for this candidate.",
    );
  }

  try {
    return await liveEnrich(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return needsReview(
      input.finding_id,
      `enrichment failed: ${message}`,
      "Live enrichment call failed before a disposition could be reached.",
      null,
      true,
    );
  }
}

async function liveEnrich(input: EnrichmentInput): Promise<EnrichmentOutcome> {
  const parsed = await askStrictJson(ENRICHMENT_SYSTEM, buildEnrichmentUserPrompt(input));
  if (parsed === null) {
    return needsReview(
      input.finding_id,
      "enrichment failed: unparseable model output",
      "Model reply could not be parsed as JSON, including after one re-ask with the parse error.",
      null,
      true,
    );
  }

  const reasoning =
    typeof parsed.reasoning === "string" && parsed.reasoning.trim().length > 0
      ? parsed.reasoning.trim()
      : "(model provided no reasoning)";
  const codeSummary =
    typeof parsed.code_summary === "string" && parsed.code_summary.trim().length > 0
      ? parsed.code_summary.trim()
      : null;

  if (parsed.needs_review === true) {
    const reason =
      typeof parsed.review_reason === "string" && parsed.review_reason.trim().length > 0
        ? parsed.review_reason.trim()
        : "model declined to commit to a disposition without stating a reason";
    return needsReview(input.finding_id, reason, reasoning, codeSummary);
  }

  const code = parsed.detail_code;
  if (
    typeof code !== "string" ||
    !Object.prototype.hasOwnProperty.call(CC67_DETAIL_CODES, code)
  ) {
    return needsReview(
      input.finding_id,
      `enrichment failed: model returned unrecognized detail_code ${JSON.stringify(code ?? null)}`,
      reasoning,
      null,
      true,
    );
  }

  const subprocessor =
    typeof parsed.subprocessor === "string" && parsed.subprocessor.trim().length > 0
      ? parsed.subprocessor.trim()
      : null;

  // Disposition + severity come from the mapping table (and, for delegation,
  // the mechanical join) — never from the model's own severity claim.
  return finalizeCommitted(
    input.finding_id,
    code as CC67DetailCode,
    reasoning,
    subprocessor,
    codeSummary,
  );
}
