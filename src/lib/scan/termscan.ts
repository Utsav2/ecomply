import fs from "node:fs";
import path from "node:path";

import { FIXTURE_DIR, RULESET_PATH } from "../paths";
import { readLines } from "./walk";

export type Language = "python" | "javascript" | "shell_docker_config";

export interface Ruleset {
  ruleset_version: string;
  control: string;
  description: string;
  network_packages: {
    comment: string;
    python: string[];
    javascript: string[];
    network_ish_heuristic: string[];
  };
  term_scan: {
    comment: string;
    all_files: string[];
    python: string[];
    javascript: string[];
    shell_docker_config: string[];
  };
  file_type_map: Record<Language, string[]>;
}

export function loadRulesetRaw(): Buffer {
  return fs.readFileSync(RULESET_PATH);
}

export function parseRuleset(raw: Buffer): Ruleset {
  return JSON.parse(raw.toString("utf8")) as Ruleset;
}

// file_type_map entries: dotted entries match by suffix on the basename
// (".env.example" must win over nothing — ".env" does not suffix-match it);
// bare entries ("Dockerfile") match by exact basename.
export function fileLanguage(ruleset: Ruleset, file: string): Language | null {
  const base = path.posix.basename(file);
  for (const lang of Object.keys(ruleset.file_type_map) as Language[]) {
    for (const entry of ruleset.file_type_map[lang]) {
      if (entry.startsWith(".") ? base.endsWith(entry) : base === entry) {
        return lang;
      }
    }
  }
  return null;
}

// Deliberately dumb and broad: case-insensitive substring match. all_files
// terms apply everywhere; per-language terms apply per file_type_map.
export function termsForFile(ruleset: Ruleset, file: string): string[] {
  const lang = fileLanguage(ruleset, file);
  return lang
    ? [...ruleset.term_scan.all_files, ...ruleset.term_scan[lang]]
    : ruleset.term_scan.all_files;
}

export function lineMatchesAnyTerm(line: string, terms: string[]): boolean {
  const lower = line.toLowerCase();
  return terms.some((t) => lower.includes(t.toLowerCase()));
}

// ±radius source lines around a candidate, for the enrichment prompt.
export function getContext(file: string, line: number, radius = 5): string {
  const buf = fs.readFileSync(path.join(FIXTURE_DIR, file));
  const lines = readLines(buf);
  const start = Math.max(1, line - radius);
  const end = Math.min(lines.length, line + radius);
  const out: string[] = [];
  for (let n = start; n <= end; n++) {
    out.push(`${n === line ? ">" : " "} ${n}: ${lines[n - 1]}`);
  }
  return out.join("\n");
}
