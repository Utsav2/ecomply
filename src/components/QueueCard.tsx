"use client";

import { useRef, useState } from "react";
import { CC67_DETAIL_CODES, type Finding } from "@/lib/types";
import styles from "./QueueCard.module.css";

type Mode = "resolve" | "scope_out";

interface ReviewResponse {
  ok: boolean;
  applied: boolean;
  pushback: string | null;
}

const DETAIL_CODES = Object.keys(CC67_DETAIL_CODES);

export function QueueCard({ finding }: { finding: Finding }) {
  const [mode, setMode] = useState<Mode>("resolve");
  const [detailCode, setDetailCode] = useState<string>(DETAIL_CODES[0]);
  const [rationale, setRationale] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [pushback, setPushback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rationaleRef = useRef<HTMLTextAreaElement>(null);

  const buildBody = (assert: boolean) => {
    const base: Record<string, unknown> =
      mode === "resolve"
        ? {
            action: "resolve",
            finding_id: finding.finding_id,
            detail_code: detailCode,
            rationale: rationale.trim(),
          }
        : {
            action: "scope_out",
            finding_id: finding.finding_id,
            rationale: rationale.trim(),
          };
    if (note.trim()) base.note = note.trim();
    if (assert) base.assert = true;
    return base;
  };

  const submit = async (assert: boolean) => {
    if (!rationale.trim() || submitting || submitted) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody(assert)),
      });
      const data = (await res.json()) as ReviewResponse;
      if (data.applied) {
        // No optimistic update: the event stream carries the state change.
        setPushback(null);
        setSubmitted(true);
      } else if (data.pushback) {
        setPushback(data.pushback);
      } else {
        setError("The harness did not apply this action.");
      }
    } catch {
      setError("Request failed. The review endpoint may not be available.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.path}>
        {finding.file}:{finding.line}
      </div>
      <pre className={styles.snippet}>{finding.snippet}</pre>
      {finding.review_reason && (
        <p className={styles.reviewReason}>{finding.review_reason}</p>
      )}

      <div className={styles.modes} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "resolve"}
          className={mode === "resolve" ? styles.modeActive : styles.mode}
          onClick={() => setMode("resolve")}
        >
          Resolve
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "scope_out"}
          className={mode === "scope_out" ? styles.modeActive : styles.mode}
          onClick={() => setMode("scope_out")}
        >
          Scope out
        </button>
      </div>

      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          void submit(false);
        }}
      >
        {mode === "resolve" && (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Detail code</span>
            <select
              className={styles.select}
              value={detailCode}
              onChange={(e) => setDetailCode(e.target.value)}
              disabled={submitting || submitted}
            >
              {DETAIL_CODES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Rationale (required)</span>
          <textarea
            ref={rationaleRef}
            className={styles.textarea}
            rows={3}
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            disabled={submitting || submitted}
            required
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Note (optional)</span>
          <input
            className={styles.input}
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={submitting || submitted}
          />
        </label>

        {pushback && (
          <div className={styles.pushback}>
            <div className={styles.pushbackLabel}>Harness pushback</div>
            <p className={styles.pushbackText}>{pushback}</p>
            <div className={styles.pushbackActions}>
              <button
                type="button"
                className={styles.secondary}
                disabled={submitting}
                onClick={() => {
                  setPushback(null);
                  rationaleRef.current?.focus();
                }}
              >
                Edit rationale and resubmit
              </button>
              <button
                type="button"
                className={styles.secondary}
                disabled={submitting}
                onClick={() => void submit(true)}
              >
                Record as user-asserted
              </button>
            </div>
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        {submitted ? (
          <p className={styles.recorded}>
            Recorded. The resolution will appear in the run log.
          </p>
        ) : (
          <button
            type="submit"
            className={styles.submit}
            disabled={submitting || !rationale.trim()}
          >
            {mode === "resolve" ? "Record resolution" : "Record scope-out"}
          </button>
        )}
      </form>
    </div>
  );
}
