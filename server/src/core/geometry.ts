import type { Rect } from "./types.ts";

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Apple Vision returns normalized boxes with the origin at the BOTTOM-left.
 * Anki image occlusion and our data model use the TOP-left. Convert once, at the edge.
 */
export function fromVisionBox(b: { x: number; y: number; width: number; height: number }): Rect {
  return {
    left: clamp01(b.x),
    top: clamp01(1 - b.y - b.height),
    width: clamp01(b.width),
    height: clamp01(b.height),
  };
}

/** Smallest rect containing all the given rects (for multi-word labels). */
export function union(rects: Rect[]): Rect {
  if (rects.length === 0) throw new Error("union of zero rects");
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.left + r.width));
  const bottom = Math.max(...rects.map((r) => r.top + r.height));
  return { left, top, width: right - left, height: bottom - top };
}

/**
 * Masks padded to a uniform size so a mask's shape never hints at the answer
 * (a long mask = a long word). Each mask keeps its centre and grows to the size of
 * the largest mask on the page plus padding, clamped to the image.
 */
export function uniformMasks(rects: Rect[], pad = 0.005): Rect[] {
  if (rects.length === 0) return [];
  const w = Math.max(...rects.map((r) => r.width)) + 2 * pad;
  const h = Math.max(...rects.map((r) => r.height)) + 2 * pad;
  return rects.map((r) => {
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const width = Math.min(1, w);
    const height = Math.min(1, h);
    const left = clamp01(Math.min(cx - width / 2, 1 - width));
    const top = clamp01(Math.min(cy - height / 2, 1 - height));
    return { left, top, width, height };
  });
}

/**
 * Anki's native image-occlusion field format (Anki 23.10+), e.g.
 * {{c1::image-occlusion:rect:left=.0476:top=.298:width=.0744:height=.0414:oi=1}}
 */
export function toAnkiOcclusion(masks: Rect[]): string {
  const fmt = (n: number) => String(round4(n)).replace(/^0\./, ".");
  return masks
    .map(
      (m, i) =>
        `{{c${i + 1}::image-occlusion:rect:left=${fmt(m.left)}:top=${fmt(m.top)}:width=${fmt(m.width)}:height=${fmt(m.height)}:oi=1}}`,
    )
    .join("<br>");
}

/**
 * Anki image-occlusion field for grouped cards: masks in the same group share one cloze
 * number, so one Anki card hides the whole group (e.g. 3-4 neighbouring labels).
 */
export function toAnkiOcclusionGroups(groups: Rect[][]): string {
  const fmt = (n: number) => String(round4(n)).replace(/^0\./, ".");
  return groups
    .flatMap((g, i) =>
      g.map(
        (m) =>
          `{{c${i + 1}::image-occlusion:rect:left=${fmt(m.left)}:top=${fmt(m.top)}:width=${fmt(m.width)}:height=${fmt(m.height)}:oi=1}}`,
      ),
    )
    .join("<br>");
}
