import type { ScopeExclusion } from "../types";

// compliance.yaml globs are all of the shape "prefix/**": any path under that
// directory. Implemented directly; no glob dependency.
export function matchExclusion(
  file: string,
  exclusions: ScopeExclusion[],
): ScopeExclusion | null {
  for (const exclusion of exclusions) {
    if (exclusion.path.endsWith("/**")) {
      const prefix = exclusion.path.slice(0, -"/**".length);
      if (file === prefix || file.startsWith(prefix + "/")) return exclusion;
    } else if (file === exclusion.path) {
      return exclusion;
    }
  }
  return null;
}
