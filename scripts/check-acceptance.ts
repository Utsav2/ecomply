// Acceptance check: every seeded finding in the fixture must surface with its
// expected outcome, every file must be accounted, the recorded demo run must
// land with exactly the two intended queue items blocking the gate — and a
// FRESH deterministic scan must agree with the recording.
// Exits non-zero on any failure. Run: npx tsx scripts/check-acceptance.ts

import { readFileSync } from "node:fs";
import { decodeJsonl } from "../src/lib/events";
import { fold, type RunState } from "../src/lib/fold";
import { PREBAKED_RUN_PATH } from "../src/lib/paths";
import { runScan } from "../src/lib/scan";
import type { Finding } from "../src/lib/types";

interface Expectation {
  label: string;
  file: string;
  snippetIncludes: string;
  check: (f: Finding) => string | null; // null = pass, string = failure detail
}

const expectations: Expectation[] = [
  {
    label: "#1 clean https via requests → CONFORMING/TLS_ENFORCED (manifest layer)",
    file: "app/main.py",
    snippetIncludes: "api.exchangerate.host",
    check: (f) =>
      f.disposition === "CONFORMING" &&
      f.detail_code === "TLS_ENFORCED" &&
      f.source === "manifest" &&
      f.resolution_status === "AUTO_VALIDATED"
        ? null
        : `got ${f.disposition}/${f.detail_code}/${f.source}/${f.resolution_status}`,
  },
  {
    label: "#2 verify=False in scope → EXCEPTION/TLS_DISABLED_EXPLICITLY/HIGH",
    file: "app/sync.py",
    snippetIncludes: "verify=False",
    check: (f) =>
      f.disposition === "EXCEPTION" &&
      f.detail_code === "TLS_DISABLED_EXPLICITLY" &&
      f.severity === "HIGH" &&
      f.resolution_status === "AUTO_VALIDATED"
        ? null
        : `got ${f.disposition}/${f.detail_code}/${f.severity}/${f.resolution_status}`,
  },
  {
    label: "#3 plain http in JS fetch → EXCEPTION/TLS_NOT_ENFORCED/MEDIUM (term scan)",
    file: "static/js/checkout.js",
    snippetIncludes: "http://",
    check: (f) =>
      f.disposition === "EXCEPTION" &&
      f.detail_code === "TLS_NOT_ENFORCED" &&
      f.severity === "MEDIUM" &&
      f.source === "term_scan"
        ? null
        : `got ${f.disposition}/${f.detail_code}/${f.severity}/${f.source}`,
  },
  {
    label: "#4 curl http:// in Dockerfile → EXCEPTION/TLS_NOT_ENFORCED (non-code egress)",
    file: "Dockerfile",
    snippetIncludes: "get.legacy-tools",
    check: (f) =>
      f.disposition === "EXCEPTION" && f.detail_code === "TLS_NOT_ENFORCED"
        ? null
        : `got ${f.disposition}/${f.detail_code}`,
  },
  {
    label: "#5 Stripe SDK call → EXCEPTION via attestation gap (DELEGATED_TO_SUBPROCESSOR)",
    file: "app/billing.py",
    snippetIncludes: "stripe.Charge.create",
    check: (f) =>
      f.disposition === "EXCEPTION" &&
      f.detail_code === "DELEGATED_TO_SUBPROCESSOR" &&
      /encryption in transit/i.test(f.reasoning)
        ? null
        : `got ${f.disposition}/${f.detail_code}; reasoning cites gap: ${/encryption in transit/i.test(f.reasoning)}`,
  },
  {
    label: "#6 env-var webhook URL → NEEDS_REVIEW (scheme not statically verifiable)",
    file: "app/webhooks.py",
    snippetIncludes: "PAYMENT_WEBHOOK_URL",
    check: (f) =>
      f.resolution_status === "NEEDS_REVIEW" &&
      /environment variable/i.test(f.review_reason ?? "")
        ? null
        : `got ${f.resolution_status} (${f.review_reason})`,
  },
  {
    label: "#7 internal-service http call → NEEDS_REVIEW (scope-out candidate)",
    file: "app/auth_client.py",
    snippetIncludes: "auth-internal",
    check: (f) =>
      f.resolution_status === "NEEDS_REVIEW"
        ? null
        : `got ${f.resolution_status} ${f.disposition}/${f.detail_code}`,
  },
  {
    label: "#8 verify=False in excluded path → OUT_OF_SCOPE_SYSTEM_LEVEL, on the record",
    file: "tools/internal-cli/probe.py",
    snippetIncludes: "verify=False",
    check: (f) =>
      f.disposition === "OUT_OF_SCOPE_SYSTEM_LEVEL" &&
      f.resolution_status === "AUTO_VALIDATED"
        ? null
        : `got ${f.disposition}/${f.resolution_status}`,
  },
];

function findFinding(state: RunState, e: Expectation): Finding | undefined {
  return state.finding_order
    .map((id) => state.findings[id])
    .find((f) => f.file === e.file && f.snippet.includes(e.snippetIncludes));
}

function main() {
  const events = decodeJsonl(readFileSync(PREBAKED_RUN_PATH, "utf8"));
  const state = fold(events);
  let failures = 0;

  for (const e of expectations) {
    const f = findFinding(state, e);
    const result = f ? e.check(f) : "candidate not found in population";
    const status = result === null ? "PASS" : "FAIL";
    if (result !== null) failures++;
    console.log(`${status}  ${e.label}${result ? `\n      ${result}` : ""}`);
  }

  const fileCount = Object.keys(state.files).length;
  const structural: [string, boolean, string][] = [
    ["every file accounted (19)", fileCount === 19, `${fileCount} accounted`],
    [
      "population locked equals candidates",
      state.population === state.finding_order.length,
      `population=${state.population}, candidates=${state.finding_order.length}`,
    ],
    [
      "demo lands with exactly 2 queue blockers",
      state.gate.blockers.length === 2 && !state.gate.open,
      `gate ${state.gate.open ? "open" : "closed"}, ${state.gate.blockers.length} blockers`,
    ],
    ["run completed", state.complete, `complete=${state.complete}`],
  ];
  for (const [label, ok, detail] of structural) {
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${label} (${detail})`);
  }

  // The reproducibility claim, checked: a fresh scan of the fixture must
  // produce exactly the population the recorded run locked.
  const scan = runScan();
  const scanKey = (c: { file: string; line: number; source: string }) =>
    `${c.file}:${c.line}:${c.source}`;
  const fresh = scan.candidates.map(scanKey).sort();
  const recorded = events
    .filter((e) => e.type === "candidate_found")
    .map((e) => scanKey(e as { file: string; line: number; source: string }))
    .sort();
  const reproducibility: [string, boolean, string][] = [
    [
      "fresh scan reproduces the recorded population",
      JSON.stringify(fresh) === JSON.stringify(recorded),
      `fresh=${fresh.length}, recorded=${recorded.length}`,
    ],
    [
      "scan is deterministic across runs",
      JSON.stringify(scan) === JSON.stringify(runScan()),
      "byte-identical results",
    ],
    [
      "manifest layer: only known network packages, flask absent",
      scan.imports.every((i) => i.known && i.package !== "flask"),
      scan.imports.map((i) => i.package).join(","),
    ],
    [
      "fresh ruleset/compliance hashes match the recording",
      scan.ruleset_hash === state.ruleset_hash &&
        scan.manifest_hash === state.manifest_hash,
      "methodology hashes stable",
    ],
  ];
  for (const [label, ok, detail] of reproducibility) {
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${label} (${detail})`);
  }

  console.log(failures === 0 ? "\nAll acceptance checks passed." : `\n${failures} failure(s).`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
