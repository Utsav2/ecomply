// Records the pre-baked demo run: executes the full pipeline locally (memory
// store), then persists the event stream as data/prebaked-run.jsonl. Live
// enrichment results are persisted into data/enrichment-cache.json by the
// engine as they arrive, so the shipped cache is warmed by the same run.
//
// Run with a real key for genuine reasoning:
//   ANTHROPIC_API_KEY=... npx tsx scripts/record-run.ts

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// Load .env.local the same way `next dev` does, so `npm run record` sees the
// same ANTHROPIC_API_KEY the app uses.
try {
  for (const line of readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
  }
} catch {
  // no .env.local — fine
}
import { runFull } from "../src/lib/engine";
import { encodeJsonl } from "../src/lib/events";
import { fold } from "../src/lib/fold";
import { DATA_DIR, PREBAKED_RUN_PATH } from "../src/lib/paths";
import { getStore } from "../src/lib/store";

async function main() {
  if (process.env.UPSTASH_REDIS_REST_URL) {
    console.error(
      "Refusing to record against Upstash; unset UPSTASH_REDIS_REST_URL to use the memory store.",
    );
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn(
      "WARNING: no ANTHROPIC_API_KEY — cache misses will be recorded as NEEDS_REVIEW\n" +
        "(the harness declines to judge without the model). Record with a key.\n",
    );
  }

  await runFull();
  const events = await getStore().read();
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(PREBAKED_RUN_PATH, encodeJsonl(events));

  const state = fold(events);
  console.log(`Recorded ${events.length} events → ${path.relative(process.cwd(), PREBAKED_RUN_PATH)}`);
  console.log(`run_id: ${state.run_id}`);
  console.log(`population: ${state.population}`);
  console.log(`gate: ${state.gate.open ? "open" : `closed (${state.gate.blockers.length} blockers)`}`);
  console.log("\nFindings:");
  for (const id of state.finding_order) {
    const f = state.findings[id];
    console.log(
      `  ${f.file}:${f.line}  ${f.resolution_status === "NEEDS_REVIEW" ? "NEEDS_REVIEW" : f.disposition}` +
        `${f.detail_code ? ` · ${f.detail_code}` : ""}${f.severity ? ` · ${f.severity}` : ""}` +
        `${f.review_reason ? `  (${f.review_reason})` : ""}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
