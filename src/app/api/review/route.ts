// Review API: queue-only resolution. A resolution is never a mutation — it is
// a new enrichment event (and, for scope-outs, a scope_entry ledger record)
// appended to the same stream the pipeline writes, with the resulting
// gate_status in the same atomic append.

import { checkScopeOutRationale } from "@/lib/enrich";
import type { EventPayload, HarnessEvent } from "@/lib/events";
import { computeGate, fold, foldStep } from "@/lib/fold";
import { ensureSeeded } from "@/lib/seed";
import { getStore } from "@/lib/store";
import { CC67_DETAIL_CODES, type CC67DetailCode } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const APPROVER = "Cathy Compliance";

interface ReviewBody {
  action: "resolve" | "scope_out";
  finding_id: string;
  detail_code?: string;
  rationale?: string;
  note?: string;
  assert?: boolean;
}

function bad(status: number, error: string): Response {
  return Response.json({ ok: false, error }, { status });
}

// Appends the decision events plus the gate they produce in ONE append, and
// revalidates against a fresh fold immediately before — so a concurrent
// re-run (stream reset) or duplicate review turns into a 409, never a
// fabricated record in the wrong run.
async function commitDecision(
  run_id: string | null,
  finding_id: string,
  decision: EventPayload[],
): Promise<Response> {
  const store = getStore();
  const state = fold(await store.read());
  if (state.run_id !== run_id) {
    return bad(409, "a new run replaced this one; review it instead");
  }
  const finding = state.findings[finding_id];
  if (!finding || finding.resolution_status !== "NEEDS_REVIEW") {
    return bad(409, "finding is no longer in the review queue");
  }
  // Gate for the log: fold our own events onto the fresh state.
  for (const p of decision) {
    foldStep(state, { ...p, seq: 0, ts: "" } as HarnessEvent);
  }
  const gate = computeGate(state);
  await store.append([
    ...decision,
    { type: "gate_status", open: gate.open, blockers: gate.blockers },
  ]);
  return Response.json({ ok: true, applied: true, pushback: null });
}

export async function POST(req: Request): Promise<Response> {
  await ensureSeeded();

  let body: ReviewBody;
  try {
    body = (await req.json()) as ReviewBody;
  } catch {
    return bad(400, "request body must be JSON");
  }
  if (typeof body.finding_id !== "string" || typeof body.action !== "string") {
    return bad(400, "finding_id and action are required");
  }
  const rationale = typeof body.rationale === "string" ? body.rationale.trim() : "";
  if (!rationale) return bad(400, "a recorded rationale is required");
  const note =
    typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;

  const state = fold(await getStore().read());
  const finding = state.findings[body.finding_id];
  if (!finding) return bad(404, "unknown finding");
  if (finding.resolution_status !== "NEEDS_REVIEW") {
    // Queue-only: AUTO_VALIDATED and RESOLVED results are final.
    return bad(409, "finding is not in the review queue");
  }

  if (body.action === "resolve") {
    const code = body.detail_code;
    if (
      typeof code !== "string" ||
      !Object.prototype.hasOwnProperty.call(CC67_DETAIL_CODES, code)
    ) {
      return bad(400, "unknown detail_code");
    }
    const mapping = CC67_DETAIL_CODES[code as CC67DetailCode];
    return commitDecision(state.run_id, finding.finding_id, [
      {
        type: "enrichment",
        finding_id: finding.finding_id,
        disposition: mapping.disposition,
        detail_code: code,
        severity: mapping.severity,
        reasoning: rationale,
        resolution_status: "RESOLVED",
        actor: "human",
        note,
      },
    ]);
  }

  if (body.action === "scope_out") {
    const check = await checkScopeOutRationale({ finding, rationale });
    if (!check.ok && body.assert !== true) {
      // Claude can push back but not overrule; nothing is recorded yet.
      return Response.json({ ok: true, applied: false, pushback: check.pushback });
    }
    return commitDecision(state.run_id, finding.finding_id, [
      {
        type: "scope_entry",
        finding_id: finding.finding_id,
        level: "finding",
        rationale,
        approved_by: APPROVER,
        ...(check.ok
          ? {}
          : { harness_flagged: true, pushback: check.pushback ?? undefined }),
      },
      {
        type: "enrichment",
        finding_id: finding.finding_id,
        disposition: "OUT_OF_SCOPE_FINDING_LEVEL",
        detail_code: null,
        severity: null,
        reasoning: rationale,
        resolution_status: "RESOLVED",
        actor: "human",
        note,
      },
    ]);
  }

  return bad(400, "unknown action");
}
