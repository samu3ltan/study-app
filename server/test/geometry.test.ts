import { test } from "node:test";
import assert from "node:assert/strict";
import { fromVisionBox, toAnkiOcclusion, uniformMasks, union } from "../src/core/geometry.ts";

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
