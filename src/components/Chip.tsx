import styles from "./Chip.module.css";
import type { Disposition, Severity } from "@/lib/types";

export type ChipTone =
  | "conforming"
  | "exception"
  | "review"
  | "delegated"
  | "neutral"
  | "code";

export function dispositionTone(d: Disposition): ChipTone {
  switch (d) {
    case "CONFORMING":
      return "conforming";
    case "EXCEPTION":
      return "exception";
    case "DELEGATED":
      return "delegated";
    case "OUT_OF_SCOPE_SYSTEM_LEVEL":
    case "OUT_OF_SCOPE_FINDING_LEVEL":
    case "NOT_APPLICABLE":
      return "neutral";
  }
}

export function severityTone(s: Severity): ChipTone {
  switch (s) {
    case "HIGH":
      return "exception";
    case "MEDIUM":
      return "review";
    case "LOW":
      return "delegated";
  }
}

export function Chip({ label, tone }: { label: string; tone: ChipTone }) {
  return <span className={`${styles.chip} ${styles[tone]}`}>{label}</span>;
}
