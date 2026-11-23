import { test } from "node:test";
import assert from "node:assert/strict";
import { findLabels, pageWordsText } from "../src/pipeline/layout.ts";
import { getSubject } from "../src/core/subjects/index.ts";
import type { OcrSpan } from "../src/core/types.ts";

const box = { left: 0.1, top: 0.1, width: 0.05, height: 0.02 };
const spans: OcrSpan[] = [
  { id: "s6", text: "Aortal", box, confidence: 1, words: [{ id: "s6.w1", text: "Aortal", box }] },
  { id: "s9", text: "Right atrium", box, confidence: 1, words: [{ id: "s9.w1", text: "Right", box }, { id: "s9.w2", text: "atrium", box }] },
];

test("word list shows every word id", () => {
  assert.match(pageWordsText(spans), /s9\.w2="atrium"/);
});

test("findLabels sends the image and builds validated labels", async () => {
  let body: any;
  const fakeFetch = (async (_url: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    return new Response(
      JSON.stringify({
        content: [
          {
            type: "tool_use",
            name: "submit_labels",
            input: {
              labels: [
                { wordIds: ["s6.w1"], text: "Aorta" },
                { wordIds: ["s9.w1", "s9.w2"], text: "Right atrium" },
                { wordIds: ["s9.w1"], text: "Right" },
              ],
            },
          },
        ],
        usage: { input_tokens: 1500, output_tokens: 200 },
      }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;

  const r = await findLabels({
    spans,
    subject: getSubject("biology"),
    apiKey: "k",
    image: { base64: "AAAA", mediaType: "image/png" },
    fetchImpl: fakeFetch,
  });
  assert.equal(body.messages[0].content[0].type, "image");
  assert.deepEqual(body.tool_choice, { type: "tool", name: "submit_labels" });
  assert.equal(r.labels.length, 2);
  assert.equal(r.labels[0].corrected, true);
  assert.equal(r.rejected.length, 1, "reused word refused");
});
