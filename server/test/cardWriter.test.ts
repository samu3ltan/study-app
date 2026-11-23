import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRequest, parseResponse, writeCards } from "../src/pipeline/cardWriter.ts";
import { getSubject } from "../src/core/subjects/index.ts";
import type { OcrSpan } from "../src/core/types.ts";

const box = { left: 0.1, top: 0.1, width: 0.1, height: 0.02 };
const spans: OcrSpan[] = [
  { id: "s1", text: "Figure 2. The heart", box, confidence: 0.99 },
  { id: "s2", text: "Left atrium", box, confidence: 0.98 },
  { id: "s3", text: "The SA node is the primary pacemaker of the heart.", box, confidence: 0.97 },
];
const med = getSubject("medicine");

const apiResponse = (cards: unknown[]) => ({
  content: [{ type: "tool_use", name: "submit_cards", input: { cards } }],
  usage: { input_tokens: 900, output_tokens: 300 },
});

test("request forces the submit_cards tool and includes span ids and subject guidance", () => {
  const req = buildRequest({ spans, subject: med, mode: "fast", apiKey: "k" }) as Record<string, any>;
  assert.equal(req.model, "claude-haiku-5-5");
  assert.deepEqual(req.tool_choice, { type: "tool", name: "submit_cards" });
  assert.match(req.messages[0].content, /\[s2\] Left atrium/);
  assert.match(req.system, /never interpret the image yourself/);
});

test("parseResponse keeps well-formed cards and drops malformed ones", () => {
  const cards = parseResponse(
    apiResponse([
      { kind: "occlusion", front: "Name the hidden label", back: "Left atrium", citedSpanIds: ["s2"], occlusionSpanIds: ["s2"] },
      { kind: "essay", front: "x", back: "y", citedSpanIds: ["s1"] },
      { kind: "basic", front: 3, back: "y", citedSpanIds: ["s1"] },
    ]),
  );
  assert.equal(cards.length, 1);
  assert.deepEqual(cards[0].occlusion, { spanIds: ["s2"] });
});

test("parseResponse errors clearly when the tool was not called", () => {
  assert.throws(() => parseResponse({ content: [{ type: "text", text: "hi" }] }), /did not call submit_cards/);
});

test("writeCards sends the right headers and runs the verifier on each card", async () => {
  let seen: { url: string; init: RequestInit } | undefined;
  const fakeFetch = (async (url: string, init: RequestInit) => {
    seen = { url, init };
    return new Response(
      JSON.stringify(
        apiResponse([
          { kind: "occlusion", front: "Name the hidden label", back: "Left atrium", citedSpanIds: ["s2"], occlusionSpanIds: ["s2"] },
          { kind: "cloze", front: "The {{c1::AV node}} is the primary pacemaker.", back: "", citedSpanIds: ["s3"] },
        ]),
      ),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as unknown as typeof fetch;

  const { cards, usage } = await writeCards({ spans, subject: med, mode: "learn", apiKey: "test-key", fetchImpl: fakeFetch });
  assert.equal(seen?.url, "https://api.anthropic.com/v1/messages");
  const headers = seen?.init.headers as Record<string, string>;
  assert.equal(headers["x-api-key"], "test-key");
  assert.equal(headers["anthropic-version"], "2023-06-01");
  assert.equal(cards[0].check.ok, true, cards[0].check.problems.join("; "));
  assert.equal(cards[1].check.ok, false, "invented cloze answer must be rejected");
  assert.deepEqual(usage, { input_tokens: 900, output_tokens: 300 });
});

test("writeCards surfaces API errors", async () => {
  const fakeFetch = (async () => new Response("overloaded", { status: 529 })) as unknown as typeof fetch;
  await assert.rejects(writeCards({ spans, subject: med, mode: "fast", apiKey: "k", fetchImpl: fakeFetch }), /Anthropic API error 529/);
});

test("prompt tells the model not to make 'another name' cards", () => {
  const spans = [{ id: "s1", text: "Left atrium", box: { left: 0.1, top: 0.1, width: 0.1, height: 0.02 }, confidence: 1 }];
  const req = buildRequest({ spans, subject: med, mode: "fast", apiKey: "k" }) as Record<string, any>;
  assert.match(req.system, /another name, synonym or alternative term/);
});
