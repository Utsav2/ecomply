import type { Ruleset } from "./termscan";
import { fileLanguage } from "./termscan";

export type Ecosystem = "python" | "javascript";

export interface NetworkPackage {
  name: string;
  ecosystem: Ecosystem;
  known: boolean; // false → network-ish name heuristic; flagged, never dropped
}

export interface ImportHit {
  file: string;
  package: string;
  ecosystem: Ecosystem;
  known: boolean;
  line: number; // first import line; the fallback candidate anchor
  lineText: string;
}

export function parseRequirementsTxt(text: string): string[] {
  const names: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9_.-]+)\s*==/.exec(line);
    if (m) names.push(m[1]);
  }
  return names;
}

export function parsePackageJsonDeps(text: string): string[] {
  const parsed = JSON.parse(text) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  return [
    ...Object.keys(parsed.dependencies ?? {}),
    ...Object.keys(parsed.devDependencies ?? {}),
  ];
}

// known-list hit → network-capable; heuristic name hit → still network-capable
// but flagged known:false for manual review rather than dropped; else not
// network-capable (flask must not trigger).
export function classifyPackage(
  ruleset: Ruleset,
  name: string,
  ecosystem: Ecosystem,
): NetworkPackage | null {
  if (ruleset.network_packages[ecosystem].includes(name)) {
    return { name, ecosystem, known: true };
  }
  const lower = name.toLowerCase();
  if (
    ruleset.network_packages.network_ish_heuristic.some((h) =>
      lower.includes(h.toLowerCase()),
    )
  ) {
    return { name, ecosystem, known: false };
  }
  return null;
}

function pythonImportsOnLine(line: string): string[] {
  const mods: string[] = [];
  const plain = /^\s*import\s+(.+)$/.exec(line);
  if (plain) {
    for (const part of plain[1].split(",")) {
      const name = part.trim().split(/\s+/)[0]; // strips "as alias"
      if (name) mods.push(name.split(".")[0]);
    }
  }
  const from = /^\s*from\s+([A-Za-z0-9_.]+)\s+import\b/.exec(line);
  if (from) mods.push(from[1].split(".")[0]);
  return mods;
}

function jsImportsOnLine(line: string): string[] {
  const mods: string[] = [];
  const patterns = [
    /require\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\s+(?:[^"']*?\bfrom\s+)?["']([^"']+)["']/g,
  ];
  for (const re of patterns) {
    for (const m of line.matchAll(re)) {
      const spec = m[1];
      const segs = spec.split("/");
      mods.push(spec.startsWith("@") ? segs.slice(0, 2).join("/") : segs[0]);
    }
  }
  return mods;
}

// One ImportHit per (file, package), anchored at the first importing line.
export function findImports(
  ruleset: Ruleset,
  file: string,
  lines: string[],
  packages: NetworkPackage[],
): ImportHit[] {
  const lang = fileLanguage(ruleset, file);
  if (lang !== "python" && lang !== "javascript") return [];
  const wanted = new Map(
    packages.filter((p) => p.ecosystem === lang).map((p) => [p.name, p]),
  );
  if (wanted.size === 0) return [];
  const hits = new Map<string, ImportHit>();
  lines.forEach((lineText, i) => {
    const mods =
      lang === "python" ? pythonImportsOnLine(lineText) : jsImportsOnLine(lineText);
    for (const mod of mods) {
      const pkg = wanted.get(mod);
      if (pkg && !hits.has(pkg.name)) {
        hits.set(pkg.name, {
          file,
          package: pkg.name,
          ecosystem: pkg.ecosystem,
          known: pkg.known,
          line: i + 1,
          lineText,
        });
      }
    }
  });
  return [...hits.values()];
}

// Usage pattern: "pkg." for python; the bare package name for javascript.
// Case-sensitive, unlike the term scan — module identifiers are exact, and a
// prose mention ("via Stripe.") must not read as usage.
export function lineMatchesUsage(line: string, hit: ImportHit): boolean {
  const needle =
    hit.ecosystem === "python" ? `${hit.package}.` : hit.package;
  return line.includes(needle);
}
