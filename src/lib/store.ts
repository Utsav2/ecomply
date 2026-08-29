// Append-only event store. Two backends behind one interface:
//   - memory: module-global array (local dev; single Node process)
//   - upstash: Redis list via REST (Vercel; survives serverless instances)
// There is deliberately no update or delete path — the log only grows,
// except reset(), which begins a new run by replacing the stream wholesale
// (single global run state).
//
// seq is monotonic across resets: a new run's events must carry HIGHER seqs
// than anything a client has already seen, or open poll cursors would
// silently filter the new run out.

import { Redis } from "@upstash/redis";
import type { EventPayload, HarnessEvent } from "./events";

export interface EventStore {
  // Assigns seq + ts, appends atomically, returns the enveloped events.
  append(payloads: EventPayload[]): Promise<HarnessEvent[]>;
  read(sinceSeq?: number): Promise<HarnessEvent[]>;
  count(): Promise<number>;
  reset(events: HarnessEvent[]): Promise<void>;
  // One-shot cold-start seeding; false if another instance won the race.
  seedIfEmpty(events: HarnessEvent[]): Promise<boolean>;
}

const KEY = "harness:events";
const KEY_SEQ = "harness:seq";
const KEY_SEEDED = "harness:seeded";

function maxSeq(events: HarnessEvent[]): number {
  return events.reduce((m, e) => Math.max(m, e.seq), 0);
}

function bySeq(a: HarnessEvent, b: HarnessEvent): number {
  return a.seq - b.seq;
}

class MemoryStore implements EventStore {
  private events: HarnessEvent[] = [];
  private nextSeq = 1;

  async append(payloads: EventPayload[]): Promise<HarnessEvent[]> {
    const ts = new Date().toISOString();
    const enveloped = payloads.map(
      (p, i) => ({ ...p, seq: this.nextSeq + i, ts }) as HarnessEvent,
    );
    this.nextSeq += enveloped.length;
    this.events.push(...enveloped);
    return enveloped;
  }

  async read(sinceSeq = 0): Promise<HarnessEvent[]> {
    return this.events.filter((e) => e.seq > sinceSeq);
  }

  async count(): Promise<number> {
    return this.events.length;
  }

  async reset(events: HarnessEvent[]): Promise<void> {
    this.events = [...events];
    this.nextSeq = Math.max(this.nextSeq, maxSeq(events) + 1);
  }

  async seedIfEmpty(events: HarnessEvent[]): Promise<boolean> {
    if (this.events.length > 0) return false;
    await this.reset(events);
    return true;
  }
}

// seq assignment and RPUSH happen in one Lua script, so list order always
// agrees with seq order even under concurrent appends — a cursor that has
// seen seq N can never later be handed an unseen event with seq < N.
const APPEND_SCRIPT = `
local n = #ARGV
local last = redis.call('INCRBY', KEYS[1], n)
local first = last - n + 1
for i = 1, n do
  redis.call('RPUSH', KEYS[2], '{"seq":' .. (first + i - 1) .. ',' .. string.sub(ARGV[i], 2))
end
return first`;

class UpstashStore implements EventStore {
  constructor(private redis: Redis) {}

  async append(payloads: EventPayload[]): Promise<HarnessEvent[]> {
    const ts = new Date().toISOString();
    const bodies = payloads.map((p) => JSON.stringify({ ...p, ts }));
    const first = Number(
      await this.redis.eval(APPEND_SCRIPT, [KEY_SEQ, KEY], bodies),
    );
    return payloads.map(
      (p, i) => ({ ...p, seq: first + i, ts }) as HarnessEvent,
    );
  }

  async read(sinceSeq = 0): Promise<HarnessEvent[]> {
    // seq aligns with list order for appends, but a reset re-pushes recorded
    // events wholesale; read whole (the stream is small), filter, sort.
    const raw = await this.redis.lrange<string | HarnessEvent>(KEY, 0, -1);
    return raw
      .map((r) => (typeof r === "string" ? (JSON.parse(r) as HarnessEvent) : r))
      .filter((e) => e.seq > sinceSeq)
      .sort(bySeq);
  }

  async count(): Promise<number> {
    return this.redis.llen(KEY);
  }

  async reset(events: HarnessEvent[]): Promise<void> {
    await this.redis.del(KEY);
    const top = maxSeq(events);
    const cur = Number((await this.redis.get(KEY_SEQ)) ?? 0);
    if (top > cur) await this.redis.set(KEY_SEQ, top);
    if (events.length > 0) {
      await this.redis.rpush(KEY, ...events.map((e) => JSON.stringify(e)));
    }
  }

  async seedIfEmpty(events: HarnessEvent[]): Promise<boolean> {
    // NX lock: exactly one cold instance replays the recording.
    const won = await this.redis.set(KEY_SEEDED, "1", { nx: true });
    if (won !== "OK") return false;
    await this.reset(events);
    return true;
  }
}

declare global {
  // Survives route-module reloads in `next dev`.
  var __harnessStore: EventStore | undefined;
}

export function getStore(): EventStore {
  if (!globalThis.__harnessStore) {
    // Accept both Upstash-native and Vercel-KV names for the same REST API.
    const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
    const token =
      process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
    globalThis.__harnessStore =
      url && token
        ? new UpstashStore(new Redis({ url, token }))
        : new MemoryStore();
  }
  return globalThis.__harnessStore;
}
