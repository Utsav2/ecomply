// The event stream, as a cursor poll: GET ?since=N returns every event with
// seq > N. The schema is the asset; the transport is deliberately the
// simplest thing that works on serverless — the client polls, and monotonic
// seqs across runs make the cursor safe through resets.

import { ensureSeeded } from "@/lib/seed";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  await ensureSeeded();
  const since = Number(new URL(req.url).searchParams.get("since") ?? 0);
  const events = await getStore().read(Number.isFinite(since) && since > 0 ? since : 0);
  return Response.json(events);
}
