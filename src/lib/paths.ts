import path from "node:path";

// All read-only assets ship inside the deploy bundle; process.cwd() is the
// project root both in `next dev` and on Vercel.
export const PROJECT_ROOT = process.cwd();
export const FIXTURE_DIR = path.join(PROJECT_ROOT, "fixture", "NonCompliantWebApp");
export const PLATFORM_DIR = path.join(PROJECT_ROOT, "platform");
export const RULESET_PATH = path.join(PLATFORM_DIR, "ruleset.v1.json");
export const SUBPROCESSORS_PATH = path.join(PLATFORM_DIR, "subprocessors.json");
export const DATA_DIR = path.join(PROJECT_ROOT, "data");
export const PREBAKED_RUN_PATH = path.join(DATA_DIR, "prebaked-run.jsonl");
export const ENRICHMENT_CACHE_PATH = path.join(DATA_DIR, "enrichment-cache.json");

export const REPO_NAME = "NonCompliantWebApp";
export const CONTROL_ID = "CC6.7";
