"use client";

// The run page's entire data layer: poll GET /api/run/events?since=N, fold
// each HarnessEvent incrementally with foldStep. A run_started event carrying
// a new run_id resets local state — re-runs replace, never append.

import { useCallback, useEffect, useRef, useState } from "react";
import type { HarnessEvent } from "@/lib/events";
import { foldStep, initialRunState, type RunState } from "@/lib/fold";

const POLL_INTERVAL_MS = 500;

export interface RunStream {
  state: RunState;
  events: HarnessEvent[];
  connected: boolean;
  rerun: () => Promise<void>;
}

export function useRunStream(): RunStream {
  const [state, setState] = useState<RunState>(() => initialRunState());
  const [events, setEvents] = useState<HarnessEvent[]>([]);
  const [connected, setConnected] = useState(false);

  const stateRef = useRef<RunState>(state);
  const eventsRef = useRef<HarnessEvent[]>([]);
  const lastSeqRef = useRef(0);
  const stoppedRef = useRef(false);

  const ingest = useCallback((batch: HarnessEvent[]) => {
    let changed = false;
    for (const e of batch) {
      if (
        e.type === "run_started" &&
        stateRef.current.run_id !== null &&
        e.run_id !== stateRef.current.run_id
      ) {
        // New run: discard prior events, refold from this event alone.
        stateRef.current = foldStep(initialRunState(), e);
        eventsRef.current = [e];
        lastSeqRef.current = e.seq;
        changed = true;
        continue;
      }
      if (e.seq <= lastSeqRef.current) continue; // duplicate
      eventsRef.current.push(e);
      foldStep(stateRef.current, e);
      lastSeqRef.current = e.seq;
      changed = true;
    }
    if (changed) {
      setState({ ...stateRef.current });
      setEvents([...eventsRef.current]);
    }
  }, []);

  const pollOnce = useCallback(async () => {
    try {
      const res = await fetch(`/api/run/events?since=${lastSeqRef.current}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`poll ${res.status}`);
      const batch = (await res.json()) as HarnessEvent[];
      if (stoppedRef.current) return;
      setConnected(true);
      if (Array.isArray(batch) && batch.length > 0) ingest(batch);
    } catch {
      if (!stoppedRef.current) setConnected(false);
    }
  }, [ingest]);

  useEffect(() => {
    stoppedRef.current = false;
    void pollOnce();
    const timer = setInterval(() => void pollOnce(), POLL_INTERVAL_MS);
    return () => {
      stoppedRef.current = true;
      clearInterval(timer);
    };
  }, [pollOnce]);

  const rerun = useCallback(async () => {
    await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    await pollOnce();
  }, [pollOnce]);

  return { state, events, connected, rerun };
}
