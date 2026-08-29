// Anthropic SDK call plumbing: one strict-JSON ask with a single re-ask on
// malformed output. Callers own semantics; this module owns transport + parse.

import Anthropic from "@anthropic-ai/sdk";

const MAX_TOKENS = 1000;

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (client === null) {
    // Identity-linked API keys must name the workspace they act in.
    const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
    client = new Anthropic({
      defaultHeaders: workspaceId
        ? { "anthropic-workspace-id": workspaceId }
        : undefined,
    });
  }
  return client;
}

function modelId(): string {
  return process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";
}

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

function tryParseJsonObject(raw: string): { value: Record<string, unknown> } | { error: string } {
  let text = raw.trim();
  // Strip code fences defensively.
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  // Tolerate stray prose around the object.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return { error: "no JSON object found in output" };
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { error: "output is not a JSON object" };
    }
    return { value: parsed as Record<string, unknown> };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

// Returns the parsed object, or null after the single re-ask also fails.
export async function askStrictJson(
  system: string,
  userPrompt: string,
): Promise<Record<string, unknown> | null> {
  const anthropic = getClient();
  const model = modelId();

  const first = await anthropic.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    system,
    messages: [{ role: "user", content: userPrompt }],
  });
  const firstText = textOf(first);
  const firstParse = tryParseJsonObject(firstText);
  if ("value" in firstParse) return firstParse.value;

  const second = await anthropic.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    system,
    messages: [
      { role: "user", content: userPrompt },
      { role: "assistant", content: firstText || "(empty reply)" },
      {
        role: "user",
        content: `Your reply could not be parsed as JSON (${firstParse.error}). Reply again with ONLY the JSON object — no code fences, no prose.`,
      },
    ],
  });
  const secondParse = tryParseJsonObject(textOf(second));
  return "value" in secondParse ? secondParse.value : null;
}
