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

const right = (r: Rect) => r.left + r.width;
const bottom = (r: Rect) => r.top + r.height;

/** True if two rects share any area (touching edges don't count). */
export function overlaps(a: Rect, b: Rect, eps = 1e-9): boolean {
  return a.left < right(b) - eps && b.left < right(a) - eps && a.top < bottom(b) - eps && b.top < bottom(a) - eps;
}

/**
 * Trim masks so no two masks overlap, while each mask still covers its whole label.
 * For each overlapping pair, a dividing line is drawn halfway through the gap between the
 * two LABELS (on whichever axis has the wider gap), and each mask is cut back to its side.
 * Cutting only ever shrinks masks, so it never creates a new overlap.
 * OCR boxes of stacked lines often overlap slightly; a small overlap is split down the middle.
 * If two labels overlap a lot (more than `maxOverlap` of the smaller one), those two masks fall
 * back to their bare labels and the pair is reported in `unavoidable`.
 */
export function separateMasks(masks: Rect[], labels: Rect[], minGap = 0.004, maxOverlap = 0.35): { masks: Rect[]; unavoidable: Array<[number, number]> } {
  const out = masks.map((m) => ({ ...m }));
  const unavoidable: Array<[number, number]> = [];
  const set = (i: number, l: number, t: number, r: number, b: number) => (out[i] = { left: l, top: t, width: r - l, height: b - t });
  for (let i = 0; i < out.length; i++)
    for (let j = i + 1; j < out.length; j++) {
      if (!overlaps(out[i], out[j])) continue;
      const [a, b] = [labels[i], labels[j]];
      const [ai, bi] = a.left <= b.left ? [i, j] : [j, i];
      const [ti, di] = a.top <= b.top ? [i, j] : [j, i];
      const gapX = labels[bi].left - right(labels[ai]);
      const gapY = labels[di].top - bottom(labels[ti]);
      let useX = gapX >= gapY;
      if (gapX <= 0 && gapY <= 0) {
        // OCR boxes of neighbouring lines often overlap a little (they include line spacing),
        // although the letters don't. Split through the middle of a small overlap;
        // only a large overlap means the labels really collide.
        const small = (gap: number, a: number, b: number) => -gap <= maxOverlap * Math.min(a, b);
        const okX = small(gapX, labels[i].width, labels[j].width);
        const okY = small(gapY, labels[i].height, labels[j].height);
        if (!okX && !okY) {
          unavoidable.push([i, j]);
          for (const k of [i, j]) out[k] = { ...labels[k] };
          continue;
        }
        useX = okX && (!okY || gapX >= gapY);
      }
      if (useX) {
        const line = right(labels[ai]) + gapX / 2;
        const g = Math.max(0, Math.min(minGap, gapX / 2) / 2);
        const A = out[ai], B = out[bi];
        set(ai, A.left, A.top, Math.min(right(A), line - g), bottom(A));
        set(bi, Math.max(B.left, line + g), B.top, right(B), bottom(B));
      } else {
        const line = bottom(labels[ti]) + gapY / 2;
        const g = Math.max(0, Math.min(minGap, gapY / 2) / 2);
        const T = out[ti], D = out[di];
        set(ti, T.left, T.top, right(T), Math.min(bottom(T), line - g));
        set(di, D.left, Math.max(D.top, line + g), right(D), bottom(D));
      }
    }
  return { masks: out, unavoidable };
}

/** Uniform-size masks, then trimmed so no two overlap (see separateMasks). */
export function pageMasks(rects: Rect[], pad = 0.005): { masks: Rect[]; unavoidable: Array<[number, number]> } {
  return separateMasks(uniformMasks(rects, pad), rects);
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
