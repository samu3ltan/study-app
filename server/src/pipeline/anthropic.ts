/**
 * Minimal Anthropic Messages API client (no dependency): one forced tool call -> its JSON input.
 */
export const API_URL = "https://api.anthropic.com/v1/messages";

export type Tool = { name: string; description: string; input_schema: Record<string, unknown> };

export type ImageBlock = { type: "image"; source: { type: "base64"; media_type: string; data: string } };
export type TextBlock = { type: "text"; text: string };

export type ToolCallOptions = {
  apiKey: string;
  model: string;
  system: string;
  content: string | Array<ImageBlock | TextBlock>;
  tool: Tool;
  maxTokens?: number;
  fetchImpl?: typeof fetch;
};

export function buildToolRequest(o: ToolCallOptions): Record<string, unknown> {
  return {
    model: o.model,
    max_tokens: o.maxTokens ?? 4096,
    system: o.system,
    tools: [o.tool],
    tool_choice: { type: "tool", name: o.tool.name },
    messages: [{ role: "user", content: o.content }],
  };
}

/** Returns the raw API JSON; use toolInput() to read the tool call. */
export async function callTool(o: ToolCallOptions): Promise<{ json: any; usage?: unknown }> {
  const f = o.fetchImpl ?? fetch;
  const res = await f(API_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": o.apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(buildToolRequest(o)),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${text.slice(0, 500)}`);
  }
  const json = (await res.json()) as { usage?: unknown };
  return { json, usage: json.usage };
}

export function toolInput(json: unknown, toolName: string): Record<string, unknown> {
  const content = (json as { content?: unknown[] })?.content;
  if (!Array.isArray(content)) throw new Error("Unexpected API response: no content array");
  const call = content.find(
    (b) => typeof b === "object" && b !== null && (b as any).type === "tool_use" && (b as any).name === toolName,
  ) as { input?: Record<string, unknown> } | undefined;
  if (!call) throw new Error(`Model did not call ${toolName}`);
  return call.input ?? {};
}
