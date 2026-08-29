"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Header breadcrumb trail: Repos / <repo> / <control> / <finding>. The landing
// page renders nothing. (lib/paths is server-only, so the repo/control names
// are repeated here.)

const REPO = "NonCompliantWebApp";
const CONTROL = "CC6.7";

interface Crumb {
  label: string;
  href?: string; // absent on the current (last) segment
  mono?: boolean;
}

function trailFor(pathname: string): Crumb[] | null {
  if (pathname === "/") return null;
  const repos: Crumb = { label: "Repos", href: "/" };
  const repo: Crumb = { label: REPO, href: "/library", mono: true };
  const control: Crumb = { label: CONTROL, href: "/run" };

  if (pathname === "/library") {
    return [repos, { ...repo, href: undefined }];
  }
  if (pathname === "/run") {
    return [repos, repo, { ...control, href: undefined }];
  }
  const findingMatch = pathname.match(/^\/findings\/([^/]+)\/?$/);
  if (findingMatch) {
    return [repos, repo, control, { label: findingMatch[1], mono: true }];
  }
  if (pathname === "/bundle") {
    return [repos, repo, control, { label: "Evidence bundle" }];
  }
  // Unknown interior page: show the repo context at least.
  return [repos, { ...repo, href: undefined }];
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const trail = trailFor(pathname);
  if (!trail) return null;

  return (
    <nav aria-label="Breadcrumb" className="breadcrumbs">
      {trail.map((crumb, i) => {
        const isLast = i === trail.length - 1;
        const cls = [
          isLast ? "breadcrumbCurrent" : "breadcrumbLink",
          crumb.mono ? "breadcrumbMono" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <span key={`${crumb.label}-${i}`} className="breadcrumbItem">
            {i > 0 && (
              <span className="breadcrumbSep" aria-hidden="true">
                /
              </span>
            )}
            {crumb.href && !isLast ? (
              <Link href={crumb.href} className={cls}>
                {crumb.label}
              </Link>
            ) : (
              <span className={cls} aria-current={isLast ? "page" : undefined}>
                {crumb.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
