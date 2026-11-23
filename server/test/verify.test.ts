import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCard, extractClozeAnswers, normalize } from "../src/core/verify.ts";
import { getSubject } from "../src/core/subjects/index.ts";
import type { OcrSpan } from "../src/core/types.ts";

const box = { left: 0.1, top: 0.1, width: 0.1, height: 0.02 };
const page = (spans: Array<[string, string, number?]>) =>
  new Map<string, OcrSpan>(spans.map(([id, text, c]) => [id, { id, text, box, confidence: c ?? 0.99 }]));

const med = getSubject("medicine");
const chem = getSubject("chemistry");
const phys = getSubject("physics");

test("normalize unifies dashes, mu, thousands separators and case", () => {
  assert.equal(normalize("  5–HT  "), "5-ht");
  assert.equal(normalize("10 μg"), "10 µg");
  assert.equal(normalize("1,000 mL."), "1000 ml");
});

test("occlusion: exact label passes", () => {
  const spans = page([["s1", "Left atrium"]]);
  const r = checkCard(
    { kind: "occlusion", front: "[mask]", back: "left atrium", citedSpanIds: ["s1"], occlusion: { spanIds: ["s1"] } },
    spans,
    med,
  );
  assert.equal(r.ok, true, r.problems.join("; "));
  assert.equal(r.needsConfirmation, false);
});

test("occlusion: invented or wrong label is rejected", () => {
  const spans = page([["s1", "Left atrium"]]);
  const r = checkCard(
    { kind: "occlusion", front: "[mask]", back: "Right atrium", citedSpanIds: ["s1"], occlusion: { spanIds: ["s1"] } },
    spans,
    med,
  );
  assert.equal(r.ok, false);
});

test("occlusion: multi-word label across two OCR spans", () => {
  const spans = page([["s1", "Superior"], ["s2", "vena cava"]]);
  const r = checkCard(
    { kind: "occlusion", front: "[mask]", back: "Superior vena cava", citedSpanIds: ["s1", "s2"], occlusion: { spanIds: ["s1", "s2"] } },
    spans,
    med,
  );
  assert.equal(r.ok, true, r.problems.join("; "));
});

test("occlusion: low OCR confidence asks the user to confirm", () => {
  const spans = page([["s1", "Pulmonary trunk", 0.6]]);
  const r = checkCard(
    { kind: "occlusion", front: "[mask]", back: "Pulmonary trunk", citedSpanIds: ["s1"], occlusion: { spanIds: ["s1"] } },
    spans,
    med,
  );
  assert.equal(r.ok, true);
  assert.equal(r.needsConfirmation, true);
});

test("medicine: a dose not on the page is rejected; a dose on the page needs a tap", () => {
  const spans = page([["s1", "Adult dose: 325 mg every 4 hours"]]);
  const wrong = checkCard({ kind: "basic", front: "Adult dose?", back: "650 mg every 4 hours", citedSpanIds: ["s1"] }, spans, med);
  assert.equal(wrong.ok, false);
  const right = checkCard({ kind: "basic", front: "Adult dose?", back: "325 mg every 4 hours", citedSpanIds: ["s1"] }, spans, med);
  assert.equal(right.ok, true, right.problems.join("; "));
  assert.equal(right.needsConfirmation, true);
});

test("cloze: answer must be in the cited text", () => {
  const spans = page([["s1", "The SA node is the primary pacemaker of the heart."]]);
  assert.deepEqual(extractClozeAnswers("The {{c1::SA node}} is the {{c2::primary pacemaker::role}}"), ["SA node", "primary pacemaker"]);
  const good = checkCard({ kind: "cloze", front: "The {{c1::SA node}} is the primary pacemaker.", back: "", citedSpanIds: ["s1"] }, spans, med);
  assert.equal(good.ok, true, good.problems.join("; "));
  const bad = checkCard({ kind: "cloze", front: "The {{c1::AV node}} is the primary pacemaker.", back: "", citedSpanIds: ["s1"] }, spans, med);
  assert.equal(bad.ok, false);
});

test("chemistry: pKa value must match; math needs confirmation", () => {
  const spans = page([["s1", "Acetic acid pKa = 4.76"]]);
  const good = checkCard({ kind: "basic", front: "pKa of acetic acid?", back: "\\(\\mathrm{p}K_a = 4.76\\)", citedSpanIds: ["s1"] }, spans, chem);
  assert.equal(good.ok, true, good.problems.join("; "));
  assert.equal(good.needsConfirmation, true);
  const bad = checkCard({ kind: "basic", front: "pKa of acetic acid?", back: "4.75", citedSpanIds: ["s1"] }, spans, chem);
  assert.equal(bad.ok, false);
});

test("physics: units trigger confirmation", () => {
  const spans = page([["s1", "g = 9.81 m/s^2 near Earth's surface"]]);
  const r = checkCard({ kind: "basic", front: "Value of g near Earth's surface?", back: "9.81 m/s^2", citedSpanIds: ["s1"] }, spans, phys);
  assert.equal(r.ok, true, r.problems.join("; "));
  assert.equal(r.needsConfirmation, true);
});

test("cards citing nothing or unknown spans are rejected", () => {
  const spans = page([["s1", "Mitochondria produce ATP"]]);
  assert.equal(checkCard({ kind: "basic", front: "?", back: "ATP", citedSpanIds: [] }, spans, med).ok, false);
  assert.equal(checkCard({ kind: "basic", front: "?", back: "ATP", citedSpanIds: ["s9"] }, spans, med).ok, false);
});

test("weakly supported wording is routed to the AI verifier", () => {
  const spans = page([["s1", "Mitochondria produce ATP through oxidative phosphorylation"]]);
  const r = checkCard({ kind: "basic", front: "Role of mitochondria?", back: "They synthesize lipids for membranes", citedSpanIds: ["s1"] }, spans, med);
  assert.equal(r.needsModelCheck, true);
});

test("'another name' and synonym cards are rejected, in any subject", () => {
  const spans = page([["s1", "Left anterior descending (LAD) (or interventricular) artery"], ["s2", "Mitochondria (also called the powerhouse of the cell)"]]);
  const cases: Array<[Parameters<typeof checkCard>[0], typeof med]> = [
    [{ kind: "basic", front: "What is another name for the LAD artery?", back: "Interventricular artery", citedSpanIds: ["s1"] }, med],
    [{ kind: "basic", front: "Give a synonym for the LAD.", back: "interventricular artery", citedSpanIds: ["s1"] }, med],
    [{ kind: "cloze", front: "Mitochondria are also called the {{c1::powerhouse}} of the cell.", back: "", citedSpanIds: ["s2"] }, chem],
  ];
  for (const [card, subject] of cases) {
    const r = checkCard(card, spans, subject);
    assert.equal(r.ok, false, card.front);
    assert.ok(r.problems.some((p) => p.includes("another name")), card.front);
  }
  const ok = checkCard({ kind: "basic", front: "What does LAD stand for?", back: "Left anterior descending", citedSpanIds: ["s1"] }, spans, med);
  assert.equal(ok.ok, true, ok.problems.join("; "));
});
