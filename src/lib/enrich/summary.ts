// AI summary of a run's findings for the control page. Summarizes what was
// found — never review status or process. Cached in-memory per findings
// fingerprint so repeated page loads cost nothing.

import { createHash } from "node:crypto";
import type { RunState } from "../fold";
import type { Finding } from "../types";
import { askStrictJson, hasApiKey } from "./model";

const SUMMARY_SYSTEM = `You are summarizing the findings of a SOC 2 CC6.7 (encryption in transit) evidence run over a code repository, for a compliance operator.

Describe WHAT WAS FOUND. Be very concise: one short lead sentence on the overall picture, then one bullet per exception — each at most ~12 words, plain English. No closing paragraph. Do not mention review status, queues, process, or tooling. No marketing language.

Format as simple markdown: the lead sentence, then "- " bullets with file paths in backtick code spans. Only paragraphs, "- " bullets, \`code\` spans, and **bold**; no headings, no tables, no links.

Reply with ONLY a JSON object: {"summary": "<the markdown summary>"}`;

function fingerprint(findings: Finding[]): string {
  const basis =
    "v3-concise|" +
    findings
      .map(
        (f) =>
          `${f.finding_id}:${f.detail_code}:${f.disposition}:${f.resolution_status}:${f.reasoning}`,
      )
      .sort()
      .join("|");
  return createHash("sha256").update(basis).digest("hex");
}

function offlineSummary(findings: Finding[]): string {
  const exceptions = findings.filter((f) => f.disposition === "EXCEPTION");
  const conforming = findings.filter((f) => f.disposition === "CONFORMING");
  const delegated = findings.filter((f) => f.detail_code === "DELEGATED_TO_SUBPROCESSOR");
  const parts = [
    `The scan surfaced ${findings.length} egress candidates across the repository.`,
    `${conforming.length} connect over TLS as expected; ${exceptions.length} do not, including ${exceptions
      .slice(0, 3)
      .map((f) => f.file)
      .join(", ")}.`,
  ];
  if (delegated.length > 0) {
    parts.push(
      `${delegated.length} finding(s) delegate transport to a third-party SDK.`,
    );
  }
  return parts.join(" ");
}

declare global {
  // Single-entry cache: one global run means at most one live fingerprint.
  var __harnessSummaryCache: { key: string; summary: string } | undefined;
}

export async function summarizeFindings(state: RunState): Promise<string> {
  const findings = state.finding_order.map((id) => state.findings[id]);
  if (findings.length === 0) return "No findings recorded yet.";

  const key = fingerprint(findings);
  const hit = globalThis.__harnessSummaryCache;
  if (hit && hit.key === key) return hit.summary;

  let summary: string;
  if (!hasApiKey()) {
    summary = offlineSummary(findings);
  } else {
    const lines = findings.map(
      (f) =>
        `${f.file}:${f.line} [${f.disposition ?? "undecided"}${f.detail_code ? ` / ${f.detail_code}` : ""}${f.severity ? ` / ${f.severity}` : ""}] ${f.snippet}` +
        (f.reasoning ? ` — ${f.reasoning}` : ""),
    );
    const parsed = await askStrictJson(
      SUMMARY_SYSTEM,
      `Findings for repo ${state.repo}, control ${state.control}:\n\n${lines.join("\n")}`,
    ).catch(() => null);
    summary =
      parsed && typeof parsed.summary === "string" && parsed.summary.trim().length > 0
        ? parsed.summary.trim()
        : offlineSummary(findings);
  }

  globalThis.__harnessSummaryCache = { key, summary };
  return summary;
}
