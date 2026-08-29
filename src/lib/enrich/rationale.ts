// Scope-out rationale check. Claude judges; it can push back but not overrule —
// the caller records user-asserted overrides. No caching.

import type { Finding } from "../types";
import { askStrictJson, hasApiKey } from "./model";
import { buildRationaleUserPrompt, RATIONALE_SYSTEM } from "./prompt";

export interface RationaleCheck {
  ok: boolean;
  pushback: string | null;
}

const THIN_RATIONALE_PUSHBACK =
  "Rationale is too thin to stand as audit evidence — state why this finding's egress cannot reach production or why the control does not apply.";

function offlineRationaleCheck(rationale: string): RationaleCheck {
  return rationale.trim().length >= 40
    ? { ok: true, pushback: null }
    : { ok: false, pushback: THIN_RATIONALE_PUSHBACK };
}

export async function checkScopeOutRationale(args: {
  finding: Finding;
  rationale: string;
}): Promise<RationaleCheck> {
  if (!hasApiKey()) return offlineRationaleCheck(args.rationale);

  let parsed: Record<string, unknown> | null;
  try {
    parsed = await askStrictJson(
      RATIONALE_SYSTEM,
      buildRationaleUserPrompt(args.finding, args.rationale),
    );
  } catch {
    parsed = null;
  }
  // Unusable model output → fall back to the deterministic length check.
  if (parsed === null || typeof parsed.ok !== "boolean") {
    return offlineRationaleCheck(args.rationale);
  }
  if (parsed.ok) return { ok: true, pushback: null };
  const pushback =
    typeof parsed.pushback === "string" && parsed.pushback.trim().length > 0
      ? parsed.pushback.trim()
      : THIN_RATIONALE_PUSHBACK;
  return { ok: false, pushback };
}
