import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLabels, buildOcclusionCards, editDistance, groupLabels } from "../src/core/labels.ts";
import { toAnkiOcclusionGroups } from "../src/core/geometry.ts";
import { checkCard } from "../src/core/verify.ts";
import { getSubject } from "../src/core/subjects/index.ts";
import { scoreLabels } from "../src/eval/score.ts";
import type { OcrSpan } from "../src/core/types.ts";

// A line with word boxes laid out left to right.
function line(id: string, text: string, left: number, top: number): OcrSpan {
  const parts = text.split(" ");
  let x = left;
  const words = parts.map((w, i) => {
    const width = 0.01 * w.length;
    const word = { id: `${id}.w${i + 1}`, text: w, box: { left: x, top, width, height: 0.03 } };
    x += width + 0.005;
    return word;
  });
  return { id, text, box: { left, top, width: x - left, height: 0.03 }, confidence: 1, words };
}

// Text exactly as Apple Vision read the coronary-arteries page in run 1 (positions simplified).
const page: OcrSpan[] = [
  line("s1", "Superior", 0.13, 0.03),
  line("s3", "vena cava", 0.11, 0.08),
  line("s6", "Aortal", 0.17, 0.19),
  line("s11", "Left anterior", 0.75, 0.39),
  line("s13", "descending (LAD)", 0.75, 0.42),
  line("s15", "(or interventricular).", 0.75, 0.46),
  line("s16", "artery", 0.75, 0.5),
  line("s22", "M1 Left marginal", 0.75, 0.67),
  line("s23", "M2 arteries", 0.75, 0.71),
];

test("edit distance", () => {
  assert.equal(editDistance("aortal", "aorta"), 1);
  assert.equal(editDistance("same", "same"), 0);
});

test("multi-line label joins words from several lines", () => {
  const { labels, rejected } = buildLabels([{ wordIds: ["s1.w1", "s3.w1", "s3.w2"], text: "Superior vena cava" }], page);
  assert.equal(rejected.length, 0);
  assert.equal(labels[0].text, "Superior vena cava");
  assert.equal(labels[0].corrected, false);
  assert.deepEqual(labels[0].spanIds, ["s1", "s3"]);
});

test("small OCR fix (Aortal -> Aorta) is allowed but must be confirmed by the user", () => {
  const { labels } = buildLabels([{ wordIds: ["s6.w1"], text: "Aorta" }], page);
  assert.equal(labels[0].text, "Aorta");
  assert.equal(labels[0].corrected, true);
  assert.match(labels[0].flags[0], /corrected from "Aortal" to "Aorta"/);
});

test("stray full stop inside a 4-line label is a small fix", () => {
  const ids = ["s11.w1", "s11.w2", "s13.w1", "s13.w2", "s15.w1", "s15.w2", "s16.w1"];
  const { labels, rejected } = buildLabels([{ wordIds: ids, text: "Left anterior descending (LAD) (or interventricular) artery" }], page);
  assert.equal(rejected.length, 0);
  assert.equal(labels[0].corrected, true);
});

test("rewording a label is refused", () => {
  const { labels, rejected } = buildLabels([{ wordIds: ["s6.w1"], text: "Ascending aorta" }], page);
  assert.equal(labels.length, 0);
  assert.match(rejected[0].reason, /too different/);
});

test("unknown or reused words are refused", () => {
  const r = buildLabels(
    [
      { wordIds: ["s99.w1"], text: "Ghost" },
      { wordIds: ["s22.w1"], text: "M1", sharedDescription: "Left marginal arteries" },
      { wordIds: ["s22.w1"], text: "M1" },
    ],
    page,
  );
  assert.equal(r.labels.length, 1);
  assert.equal(r.rejected.length, 2);
});

test("codes sharing a description: mask covers only the code", () => {
  const { labels } = buildLabels(
    [
      { wordIds: ["s22.w1"], text: "M1", sharedDescription: "Left marginal arteries" },
      { wordIds: ["s23.w1"], text: "M2", sharedDescription: "Left marginal arteries" },
    ],
    page,
  );
  assert.ok(Math.abs(labels[0].box.width - 0.02) < 1e-9); // just "M1"
  const { cards } = buildOcclusionCards(labels, 1);
  assert.equal(cards[0].back, "M1 (Left marginal arteries)");
});

test("pages from OCR v1 (no word boxes) still work, using whole lines", () => {
  const v1: OcrSpan[] = [{ id: "s9", text: "Right atrium", box: { left: 0.09, top: 0.31, width: 0.1, height: 0.03 }, confidence: 1 }];
  const { labels } = buildLabels([{ wordIds: ["s9"], text: "Right atrium" }], v1);
  assert.equal(labels[0].text, "Right atrium");
});

function fakeLabels(n: number, left: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `X${left}-${i}`, wordIds: [], spanIds: [`s${i}`], text: `Label ${i}`, ocrText: `Label ${i}`, corrected: false,
    box: { left, top: i / n, width: 0.1, height: 0.02 }, flags: [] as string[],
  }));
}

test("grouping: 17 labels (7 left, 10 right) in groups of up to 4 -> 5 cards of 3-4", () => {
  const labels = [...fakeLabels(7, 0.05), ...fakeLabels(10, 0.75)];
  const groups = groupLabels(labels, 4);
  assert.deepEqual(groups.map((g) => g.length), [4, 3, 4, 3, 3]);
  assert.equal(groupLabels(labels, 1).length, 17);
});

test("occlusion cards never give away answers and carry confirmation flags", () => {
  const labels = [...fakeLabels(3, 0.05)];
  labels[1].flags.push("Spelling corrected; please confirm.");
  const { cards, groups } = buildOcclusionCards(labels, 4);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].front, "Name the 3 hidden labels.");
  assert.equal(cards[0].back, "1. Label 0\n2. Label 1\n3. Label 2");
  assert.equal(cards[0].check.needsConfirmation, true);
  const sizes = groups[0].map((l) => `${l.mask!.width.toFixed(4)}x${l.mask!.height.toFixed(4)}`);
  assert.equal(new Set(sizes).size, 1, "all masks the same size");
});

test("Anki export: masks in one group share a cloze number", () => {
  const m = { left: 0.1, top: 0.2, width: 0.05, height: 0.02 };
  const s = toAnkiOcclusionGroups([[m, m], [m]]);
  assert.equal((s.match(/\{\{c1::/g) ?? []).length, 2);
  assert.equal((s.match(/\{\{c2::/g) ?? []).length, 1);
});

test("verifier rejects questions that give away the answer", () => {
  const spans = new Map(page.map((s) => [s.id, s]));
  const med = getSubject("medicine");
  const leakOccl = checkCard(
    { kind: "occlusion", front: "Name the hidden label (upper left, superior vena cava)", back: "Superior vena cava", citedSpanIds: ["s1", "s3"], occlusion: { spanIds: ["s1", "s3"] } },
    spans,
    med,
  );
  assert.equal(leakOccl.ok, false);
  const leakBasic = checkCard({ kind: "basic", front: "Which vessel is the superior vena cava?", back: "superior vena cava", citedSpanIds: ["s1", "s3"] }, spans, med);
  assert.equal(leakBasic.ok, false);
  const fine = checkCard({ kind: "basic", front: "What does LAD stand for?", back: "Left anterior descending", citedSpanIds: ["s11", "s13"] }, spans, med);
  assert.equal(fine.ok, true, fine.problems.join("; "));
});

test("scoring against the answer key uses aliases", () => {
  const { labels } = buildLabels(
    [
      { wordIds: ["s1.w1", "s3.w1", "s3.w2"], text: "Superior vena cava" },
      { wordIds: ["s6.w1"], text: "Aorta" },
    ],
    page,
  );
  const score = scoreLabels(labels, {
    labels: [{ text: "Superior vena cava" }, { text: "Aorta" }, { text: "Right atrium" }],
  });
  assert.equal(score.matched.length, 2);
  assert.deepEqual(score.missed, ["Right atrium"]);
  assert.equal(score.extra.length, 0);
});
