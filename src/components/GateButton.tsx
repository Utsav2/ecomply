"use client";

import Link from "next/link";
import type { GateBlocker } from "@/lib/types";
import styles from "./GateButton.module.css";

// One element in both states so the open/closed transition animates; the
// closed state carries the blocker reason in the title attribute.
export function GateButton({
  open,
  blockers,
}: {
  open: boolean;
  blockers: GateBlocker[];
}) {
  const reason =
    blockers.length > 0
      ? `${blockers.length} finding${blockers.length === 1 ? "" : "s"} unresolved`
      : "population not yet locked";
  return (
    <Link
      href="/bundle"
      aria-disabled={!open}
      tabIndex={open ? 0 : -1}
      title={open ? undefined : reason}
      className={`${styles.gate} ${open ? styles.open : styles.closed}`}
      onClick={(e) => {
        if (!open) e.preventDefault();
      }}
    >
      Generate evidence bundle
    </Link>
  );
}
