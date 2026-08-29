// Demo resilience (HANDOFF §10): a completed run ships as the default state.
// On a cold store, replay the recorded JSONL so the reviewer lands on a
// finished pipeline — queue items unresolved, gate showing its blockers.

import { readFileSync } from "node:fs";
import { decodeJsonl, type HarnessEvent } from "./events";
import { fold, type RunState } from "./fold";
import { PREBAKED_RUN_PATH } from "./paths";
import { getStore } from "./store";

export async function ensureSeeded(): Promise<void> {
  const store = getStore();
  if ((await store.count()) > 0) return;
  let jsonl: string;
  try {
    jsonl = readFileSync(PREBAKED_RUN_PATH, "utf8");
  } catch {
    return; // no pre-baked run recorded yet (pre-record dev state)
  }
  await store.seedIfEmpty(decodeJsonl(jsonl));
}

// The one way to read the log: seed if cold, read, fold.
export async function loadRun(): Promise<{ events: HarnessEvent[]; state: RunState }> {
  await ensureSeeded();
  const events = await getStore().read();
  return { events, state: fold(events) };
}
