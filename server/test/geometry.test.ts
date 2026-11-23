import { test } from "node:test";
import assert from "node:assert/strict";
import { fromVisionBox, overlaps, pageMasks, separateMasks, toAnkiOcclusion, uniformMasks, union } from "../src/core/geometry.ts";

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("Vision bottom-left boxes convert to top-left", () => {
  const r = fromVisionBox({ x: 0.1, y: 0.7, width: 0.2, height: 0.1 });
  close(r.left, 0.1);
  close(r.top, 0.2); // 1 - 0.7 - 0.1
  close(r.width, 0.2);
  close(r.height, 0.1);
});

test("union covers multi-word labels", () => {
  const r = union([
    { left: 0.1, top: 0.1, width: 0.1, height: 0.02 },
    { left: 0.22, top: 0.1, width: 0.15, height: 0.03 },
  ]);
  close(r.left, 0.1);
  close(r.width, 0.27);
  close(r.height, 0.03);
});

test("uniform masks share one size, keep centres and stay inside the image", () => {
  const masks = uniformMasks([
    { left: 0.1, top: 0.1, width: 0.05, height: 0.02 },
    { left: 0.9, top: 0.95, width: 0.09, height: 0.03 },
  ]);
  close(masks[0].width, masks[1].width);
  close(masks[0].height, masks[1].height);
  for (const m of masks) {
    assert.ok(m.left >= 0 && m.top >= 0 && m.left + m.width <= 1 + 1e-9 && m.top + m.height <= 1 + 1e-9);
  }
  close(masks[0].left + masks[0].width / 2, 0.125);
});

test("Anki image-occlusion field format", () => {
  const s = toAnkiOcclusion([
    { left: 0.0476, top: 0.298, width: 0.0744, height: 0.0414 },
    { left: 0.0714, top: 0.0207, width: 0.0506, height: 0.029 },
  ]);
  assert.equal(
    s,
    "{{c1::image-occlusion:rect:left=.0476:top=.298:width=.0744:height=.0414:oi=1}}<br>" +
      "{{c2::image-occlusion:rect:left=.0714:top=.0207:width=.0506:height=.029:oi=1}}",
  );
});

const contains = (outer: { left: number; top: number; width: number; height: number }, inner: typeof outer) =>
  outer.left <= inner.left + 1e-9 &&
  outer.top <= inner.top + 1e-9 &&
  outer.left + outer.width >= inner.left + inner.width - 1e-9 &&
  outer.top + outer.height >= inner.top + inner.height - 1e-9;

test("masks never overlap and each still covers its whole label", () => {
  // A long label forces big uniform masks; the short labels stacked close together would collide.
  const labels = [
    { left: 0.05, top: 0.10, width: 0.30, height: 0.04 },
    { left: 0.05, top: 0.16, width: 0.08, height: 0.03 },
    { left: 0.05, top: 0.20, width: 0.08, height: 0.03 },
    { left: 0.16, top: 0.16, width: 0.06, height: 0.03 },
    { left: 0.70, top: 0.50, width: 0.10, height: 0.03 },
  ];
  assert.ok(overlaps(uniformMasks(labels)[1], uniformMasks(labels)[2]), "test setup should start with overlaps");
  const { masks, unavoidable } = pageMasks(labels);
  assert.equal(unavoidable.length, 0);
  for (let i = 0; i < masks.length; i++) {
    assert.ok(contains(masks[i], labels[i]), `mask ${i} must cover its label`);
    for (let j = i + 1; j < masks.length; j++) assert.ok(!overlaps(masks[i], masks[j]), `masks ${i} and ${j} overlap`);
  }
  // A label with room around it keeps the full uniform size.
  close(masks[4].width, uniformMasks(labels)[4].width);
});

test("labels that touch fall back to their bare boxes and are reported", () => {
  const labels = [
    { left: 0.1, top: 0.1, width: 0.1, height: 0.03 },
    { left: 0.15, top: 0.11, width: 0.1, height: 0.03 },
  ];
  const { masks, unavoidable } = separateMasks(uniformMasks(labels), labels);
  assert.deepEqual(unavoidable, [[0, 1]]);
  assert.deepEqual(masks[0], labels[0]);
});

test("slightly overlapping OCR boxes of stacked lines are split down the middle", () => {
  const labels = [
    { left: 0.7, top: 0.671, width: 0.2, height: 0.047 },
    { left: 0.7, top: 0.711, width: 0.14, height: 0.039 },
  ];
  const { masks, unavoidable } = pageMasks(labels);
  assert.equal(unavoidable.length, 0);
  assert.ok(!overlaps(masks[0], masks[1]));
  close(masks[0].top + masks[0].height, 0.7145); // middle of the 0.711-0.718 overlap
});
