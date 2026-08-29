// Scan layer — the denominator. Deterministic enumeration, file accounting,
// reproducibility: no LLM, no randomness, no timestamps, stable sort order.
// Scope filters disposition, never enumeration: excluded paths are still
// walked, term-scanned, and their candidates still exist.

import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

import { sha256hex, shortHash } from "../hash";
import { FIXTURE_DIR } from "../paths";
import type { ComplianceManifest, ScopeExclusion } from "../types";
import {
  classifyPackage,
  findImports,
  lineMatchesUsage,
  parsePackageJsonDeps,
  parseRequirementsTxt,
  type Ecosystem,
  type ImportHit,
  type NetworkPackage,
} from "./manifest";
import { matchExclusion } from "./scope";
import {
  getContext,
  lineMatchesAnyTerm,
  loadRulesetRaw,
  parseRuleset,
  termsForFile,
} from "./termscan";
import { isBinary, readLines, walkFiles } from "./walk";

export interface ScanCandidate {
  finding_id: string;
  file: string;
  line: number;
  snippet: string;
  snippet_hash: string;
  source: "manifest" | "term_scan";
}

export interface ScanResult {
  ruleset_hash: string;
  manifest: ComplianceManifest;
  manifest_hash: string;
  imports: { file: string; package: string; ecosystem: Ecosystem; known: boolean }[];
  candidates: ScanCandidate[];
  file_accounting: {
    file: string;
    status: "scanned" | "matched" | "excluded_by_scope";
    scope_entry?: string;
  }[];
}

export { getContext, matchExclusion };

// Locale-independent code-unit order; localeCompare would be
// environment-dependent and break reproducibility.
function byPath(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function makeCandidate(
  file: string,
  line: number,
  rawLine: string,
  source: "manifest" | "term_scan",
): ScanCandidate {
  const snippet = rawLine.trim();
  const snippet_hash = sha256hex(snippet);
  return {
    finding_id: "f-" + shortHash(`${file}:${line}:${snippet_hash}`),
    file,
    line,
    snippet,
    snippet_hash,
    source,
  };
}

export function runScan(): ScanResult {
  const rulesetRaw = loadRulesetRaw();
  const ruleset = parseRuleset(rulesetRaw);

  const files = walkFiles(FIXTURE_DIR);
  const read = (file: string) => fs.readFileSync(path.join(FIXTURE_DIR, file));

  const manifestRaw = read("compliance.yaml");
  const manifest = parseYaml(manifestRaw.toString("utf8")) as ComplianceManifest;
  const exclusions: ScopeExclusion[] = manifest.scope.exclusions;

  // Manifest layer: declared dependencies → network-capable set.
  const networkPackages: NetworkPackage[] = [];
  const declare = (names: string[], ecosystem: Ecosystem) => {
    for (const name of names) {
      const pkg = classifyPackage(ruleset, name, ecosystem);
      if (pkg) networkPackages.push(pkg);
    }
  };
  if (files.includes("requirements.txt")) {
    declare(parseRequirementsTxt(read("requirements.txt").toString("utf8")), "python");
  }
  if (files.includes("package.json")) {
    declare(parsePackageJsonDeps(read("package.json").toString("utf8")), "javascript");
  }

  const importsByFile = new Map<string, ImportHit[]>();
  const candidates: ScanCandidate[] = [];
  const accounting: ScanResult["file_accounting"] = [];

  for (const file of files) {
    const buf = read(file);
    const exclusion = matchExclusion(file, exclusions);
    if (isBinary(buf)) {
      accounting.push(
        exclusion
          ? { file, status: "excluded_by_scope", scope_entry: exclusion.path }
          : { file, status: "scanned" },
      );
      continue;
    }
    const lines = readLines(buf);
    const imports = findImports(ruleset, file, lines, networkPackages);
    if (imports.length > 0) importsByFile.set(file, imports);

    // Term scan over every file, excluded paths included; one candidate per
    // line. A line matching an imported package's usage pattern is a manifest
    // candidate even when no term matches (an importing file's usage must
    // enter the population).
    const terms = termsForFile(ruleset, file);
    const fileCandidates: ScanCandidate[] = [];
    lines.forEach((lineText, i) => {
      const usage = imports.some((hit) => lineMatchesUsage(lineText, hit));
      const term = lineMatchesAnyTerm(lineText, terms);
      if (usage || term) {
        fileCandidates.push(
          makeCandidate(file, i + 1, lineText, usage ? "manifest" : "term_scan"),
        );
      }
    });
    // Fallback: importing file with zero candidates still enters the
    // population, anchored at its import line.
    if (fileCandidates.length === 0 && imports.length > 0) {
      const first = imports[0];
      fileCandidates.push(
        makeCandidate(file, first.line, first.lineText, "manifest"),
      );
    }
    candidates.push(...fileCandidates);

    // Accounting: excluded_by_scope wins over matched/scanned, but the file's
    // candidates above still exist — scope filters disposition downstream.
    accounting.push(
      exclusion
        ? { file, status: "excluded_by_scope", scope_entry: exclusion.path }
        : { file, status: fileCandidates.length > 0 ? "matched" : "scanned" },
    );
  }

  const imports = [...importsByFile.values()]
    .flat()
    .map(({ file, package: pkg, ecosystem, known }) => ({
      file,
      package: pkg,
      ecosystem,
      known,
    }))
    .sort((a, b) => byPath(a.file, b.file) || byPath(a.package, b.package));

  candidates.sort((a, b) => byPath(a.file, b.file) || a.line - b.line);

  return {
    ruleset_hash: sha256hex(rulesetRaw),
    manifest,
    manifest_hash: sha256hex(manifestRaw),
    imports,
    candidates,
    file_accounting: accounting, // walk order is already path-sorted
  };
}
