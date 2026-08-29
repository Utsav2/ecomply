import { summarizeFindings } from "@/lib/enrich/summary";
import { loadRun } from "@/lib/seed";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(): Promise<Response> {
  const { state } = await loadRun();
  const summary = await summarizeFindings(state);
  return Response.json({ summary });
}
