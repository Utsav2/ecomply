import { runFull } from "@/lib/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(): Promise<Response> {
  await runFull();
  return Response.json({ ok: true });
}
