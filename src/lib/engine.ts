// Run orchestration. The engine is the only writer of pipeline events; review
// POST handlers push into the same stream. gate_status re-emits after every
// state change — the export button enables purely as a consequence of events.

import { execSync } from "node:child_process";
import type { EnrichmentEvent, EventPayload, QueueItemEvent } from "./events";
import { computeGate, fold } from "./fold";
import {
  cacheKey,
  enrichCandidate,
  persistCacheEntry,
  type EnrichmentOutcome,
} from "./enrich";
import { getContext, matchExclusion, runScan, type ScanCandidate } from "./scan";
import { CONTROL_ID, REPO_NAME } from "./paths";
import { getStore } from "./store";

const ENRICHMENT_CONCURRENCY = 5;

async function emitGate(): Promise<void> {
  const store = getStore();
  const state = fold(await store.read());
  const gate = computeGate(state);
  await store.append([{ type: "gate_status", open: gate.open, blockers: gate.blockers }]);
}

function enrichmentPayload(o: EnrichmentOutcome): EventPayload<EnrichmentEvent> {
  return {
    type: "enrichment",
    finding_id: o.finding_id,
    disposition: o.disposition,
    detail_code: o.detail_code,
    severity: o.severity,
    reasoning: o.reasoning,
    resolution_status: o.resolution_status,
    actor: "claude",
    code_summary: o.code_summary,
  };
}

// The commit under audit: evidence must name the exact repository state.
function repoCommit(): string | null {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA;
  try {
    const opts: { cwd: string; stdio: ["ignore", "pipe", "ignore"] } = {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "ignore"],
    };
    const sha = execSync("git rev-parse HEAD", opts).toString().trim();
    const dirty = execSync("git status --porcelain", opts).toString().trim().length > 0;
    return dirty ? `${sha}-dirty` : sha;
  } catch {
    return null;
  }
}

// Emission pacing: cached/deterministic results would land in one burst, so
// re-runs are paced to keep the work watchable — visible, accounted-for work
// is what exhaustiveness feels like. Content is unaffected, only timing.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (base: number, spread: number) => base + Math.random() * spread;

export async function runFull(): Promise<void> {
  const store = getStore();
  const scan = runScan();
  const runId = `run-${Date.now().toString(36)}`;

  // Single global run state: a new run replaces the stream wholesale.
  await store.reset([]);
  await store.append([
    {
      type: "run_started",
      run_id: runId,
      repo: REPO_NAME,
      control: CONTROL_ID,
      ruleset_hash: scan.ruleset_hash,
      commit: repoCommit(),
    },
    {
      type: "manifest_loaded",
      manifest_hash: scan.manifest_hash,
      scope_entries: scan.manifest.scope.exclusions,
      subprocessors: scan.manifest.subprocessors,
    },
  ]);
  await sleep(250);
  await store.append([{ type: "stage_started", stage: "manifest" }]);
  for (const i of scan.imports) {
    await store.append([{ type: "manifest_import", ...i }]);
    await sleep(jitter(40, 40));
  }
  await store.append([{ type: "stage_started", stage: "term_scan" }]);
  for (const c of scan.candidates) {
    await store.append([{ type: "candidate_found", ...c }]);
    await sleep(jitter(35, 40));
  }
  await store.append([{ type: "stage_started", stage: "accounting" }]);
  for (const f of scan.file_accounting) {
    await store.append([{ type: "file_accounted", ...f }]);
    await sleep(jitter(12, 20));
  }
  // The thesis moment: the denominator freezes before enrichment begins.
  await sleep(400);
  await store.append([
    { type: "population_locked", count: scan.candidates.length },
    { type: "stage_started", stage: "enrichment" },
  ]);

  const excluded: ScanCandidate[] = [];
  const inScope: ScanCandidate[] = [];
  for (const c of scan.candidates) {
    (matchExclusion(c.file, scan.manifest.scope.exclusions) ? excluded : inScope).push(c);
  }

  // Candidates inside excluded paths are dispositioned mechanically, on the
  // record, with the rationale inherited from compliance.yaml. Nothing vanishes.
  for (const c of excluded) {
    const entry = matchExclusion(c.file, scan.manifest.scope.exclusions)!;
    await store.append([
      {
        type: "enrichment",
        finding_id: c.finding_id,
        disposition: "OUT_OF_SCOPE_SYSTEM_LEVEL",
        detail_code: null,
        severity: null,
        reasoning: `Within declared scope exclusion "${entry.path}": ${entry.rationale} (inherited from compliance.yaml; excluded on the record, not invisible).`,
        resolution_status: "AUTO_VALIDATED",
        actor: "claude",
      },
    ]);
    await emitGate();
    await sleep(jitter(70, 60));
  }

  // Enrichment: one Claude call per candidate, concurrency-limited, cache-first.
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < inScope.length) {
      const c = inScope[cursor++];
      // Cached results return instantly; pace them so assessment stays visible.
      await sleep(jitter(350, 400));
      const outcome = await enrichCandidate({
        finding_id: c.finding_id,
        file: c.file,
        line: c.line,
        snippet: c.snippet,
        snippet_hash: c.snippet_hash,
        context: getContext(c.file, c.line),
      });
      // Cache judgments (including genuine NEEDS_REVIEW), never transport or
      // parse failures — a transient error must not poison reproducibility.
      if (!outcome.cached && !outcome.transport_failure) {
        persistCacheEntry(cacheKey(c.file, c.snippet_hash), outcome);
      }
      const payloads: EventPayload[] = [enrichmentPayload(outcome)];
      if (outcome.resolution_status === "NEEDS_REVIEW") {
        payloads.push({
          type: "queue_item",
          finding_id: c.finding_id,
          review_reason: outcome.review_reason ?? "enrichment could not decide",
        } satisfies EventPayload<QueueItemEvent>);
      }
      await getStore().append(payloads);
      await emitGate();
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(ENRICHMENT_CONCURRENCY, inScope.length || 1) }, worker),
  );

  // Authoritative final gate: per-worker gate emissions each read the log
  // before their own append, so the last one can be stale under concurrency.
  await emitGate();
  await store.append([{ type: "run_complete", run_id: runId }]);
}
