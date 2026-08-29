import fs from "node:fs";
import path from "node:path";

// Enumeration is total: every file under the root, dotfiles included, no
// ignores. Scope filters disposition downstream, never enumeration.
export function walkFiles(root: string): string[] {
  const out: string[] = [];
  const visit = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(abs);
      else if (entry.isFile()) {
        out.push(path.relative(root, abs).split(path.sep).join("/"));
      }
    }
  };
  visit(root);
  return out.sort();
}

// Defensive binary sniff: a null byte in the head means we don't line-scan it.
export function isBinary(buf: Buffer): boolean {
  return buf.subarray(0, 8192).includes(0);
}

export function readLines(buf: Buffer): string[] {
  return buf.toString("utf8").split(/\r?\n/);
}
