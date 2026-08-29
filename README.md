# ecomply

An instrument that performs and accounts for compliance evidence-gathering —
not a dashboard that summarizes it. Runs SOC 2 CC6.7 (encryption in transit)
end-to-end over a bundled fixture repo, with a provable denominator, a
result for every finding, and an export gate that stays closed until
nothing is left unaddressed.

Every agent harness today optimizes for best-effort helpfulness under latency
pressure. Audit evidence requires provable completeness: a known population, a
result for every item, recorded exceptions. This inverts the default —
**comprehensiveness > latency** — via a three-party division of labor:

- **Determinism owns the denominator.** The scan layer enumerates everything,
  accounts for every file, and freezes the population before judgment begins.
  The term list is deliberately dumb and broad: false positives are cheap,
  false negatives are fatal.
- **Claude owns semantic judgment.** The enrichment layer researches each
  candidate for precision and assesses it with written reasoning — or
  declines to decide, on the record.
- **The human owns accountable judgment.** Ambiguity resolution and scope-outs
  go through a review queue with recorded rationale. Claude can push back on a
  weak rationale, but never overrule: a rejected-but-asserted scope-out is
  recorded "user-asserted, harness-flagged." Provenance, not authority.

The event log is the run log, and the run log is the evidence: the UI is a
fold over an append-only stream, the same JSONL ships as the bundle's
machine-readable appendix, and no mutation event exists in the schema.

## Running it

```bash
npm install
npm run dev
```

Open http://localhost:3000. The app seeds itself with a pre-recorded run
(`data/prebaked-run.jsonl`) — you land on a finished pipeline with two queue
items blocking the gate. Resolve them and the export gate opens. "Re-run"
executes the pipeline live; enrichment replays from the shipped cache
(`data/enrichment-cache.json`), so re-runs are near-instant and deterministic.

Environment (all optional locally — see `.env.example`):

- `ANTHROPIC_API_KEY` — live enrichment on cache misses + scope-out rationale
  checks. Without it, cache misses are honestly declined to NEEDS_REVIEW and
  rationale checks fall back to a minimum-substance rule.
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — shared event store
  for serverless deploys. Locally the store is in-memory.

## Scripts

```bash
npm run record   # execute a live run and persist prebaked-run.jsonl + warm cache
npm run check    # acceptance: all 8 seeded findings vs expected outcomes
```

## Layout

- `fixture/NonCompliantWebApp/` — the scanned demo repo (19 files, 8 seeded
  findings, `compliance.yaml` scope declarations)
- `platform/` — harness-side facts about the world: `ruleset.v1.json`
  (hashed methodology) and `subprocessors.json` (attestation registry)
- `src/lib/` — `scan/` (deterministic), `enrich/` (Claude), `fold.ts` (the one
  reducer every consumer shares), `engine.ts`, `store.ts`, `events.ts`
- `src/app/` — repo picker → control library → run page → evidence bundle
- `data/` — the recorded demo run and the enrichment cache
