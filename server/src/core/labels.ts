import type { CheckedCardLike, Label, OcrSpan, OcrWord, Rect } from "./types.ts";
import { union, uniformMasks } from "./geometry.ts";
import { normalize } from "./verify.ts";

/**
 * Labels -> occlusion cards, built by CODE (not by the model): every label gets covered,
 * labels never count toward the text-card cap, and nothing is invented.
 */

/** Index every word on the page. Pages from OCR v1 (no words) treat each line as one word. */
export function indexWords(spans: OcrSpan[]): Map<string, OcrWord & { spanId: string }> {
  const out = new Map<string, OcrWord & { spanId: string }>();
  for (const s of spans) {
    const words = s.words && s.words.length > 0 ? s.words : [{ id: s.id, text: s.text, box: s.box }];
    for (const w of words) out.set(w.id, { ...w, spanId: s.id });
  }
  return out;
}

/** Levenshtein distance, for judging how big an OCR "correction" is. */
export function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

export type RawLabel = { wordIds: string[]; text: string; sharedDescription?: string };
export type LabelResult = { labels: Label[]; rejected: Array<{ raw: RawLabel; reason: string }> };

/**
 * Validate the model's proposed labels against the OCR words:
 * - every word id must exist and no word may be used twice
 * - the printed text may differ from OCR only by a small correction (then the user must confirm)
 */
export function buildLabels(raw: RawLabel[], spans: OcrSpan[]): LabelResult {
  const words = indexWords(spans);
  const used = new Set<string>();
  const labels: Label[] = [];
  const rejected: LabelResult["rejected"] = [];

  for (const r of raw) {
    const ids = r.wordIds ?? [];
    if (ids.length === 0 || ids.some((id) => !words.has(id))) {
      rejected.push({ raw: r, reason: "points at words that are not on the page" });
      continue;
    }
    if (ids.some((id) => used.has(id))) {
      rejected.push({ raw: r, reason: "reuses words already in another label" });
      continue;
    }
    const ws = ids.map((id) => words.get(id)!);
    const ocrText = ws.map((w) => w.text).join(" ");
    const printed = (r.text ?? "").trim() || ocrText;
    const a = normalize(ocrText);
    const b = normalize(printed);
    const dist = editDistance(a, b);
    const flags: string[] = [];
    let corrected = false;
    if (dist > 0) {
      const limit = Math.max(2, Math.ceil(a.length * 0.15));
      if (dist > limit) {
        rejected.push({ raw: r, reason: `label text "${printed}" is too different from what was read ("${ocrText}")` });
        continue;
      }
      corrected = true;
      flags.push(`Spelling corrected from "${ocrText}" to "${printed}". Please confirm.`);
    }
    if (/[.|]$|\s[a-z|]$/.test(ocrText.trim()) && !corrected) {
      flags.push(`"${ocrText}" may end with a stray character from a pointer line. Please check.`);
    }
    ids.forEach((id) => used.add(id));
    labels.push({
      id: `L${labels.length + 1}`,
      wordIds: ids,
      spanIds: [...new Set(ws.map((w) => w.spanId))],
      text: printed,
      ocrText,
      corrected,
      sharedDescription: r.sharedDescription?.trim() || undefined,
      box: union(ws.map((w) => w.box)),
      flags,
    });
  }
  return { labels, rejected };
}

/**
 * Group labels so one card hides `size` neighbouring labels (size 1 = hide-one).
 * Neighbours = same side of the page (left/right of centre), in top-to-bottom order,
 * split into balanced chunks of at most `size`.
 */
export function groupLabels(labels: Label[], size: number): Label[][] {
  if (size <= 1) return labels.map((l) => [l]);
  const cx = (l: Label) => l.box.left + l.box.width / 2;
  const columns = [labels.filter((l) => cx(l) < 0.5), labels.filter((l) => cx(l) >= 0.5)];
  const groups: Label[][] = [];
  for (const col of columns) {
    const sorted = [...col].sort((a, b) => a.box.top - b.box.top);
    if (sorted.length === 0) continue;
    const k = Math.ceil(sorted.length / size);
    const base = Math.floor(sorted.length / k);
    let extra = sorted.length % k;
    let i = 0;
    for (let g = 0; g < k; g++) {
      const n = base + (extra-- > 0 ? 1 : 0);
      groups.push(sorted.slice(i, i + n));
      i += n;
    }
  }
  return groups;
}

const answerText = (l: Label) => (l.sharedDescription ? `${l.text} (${l.sharedDescription})` : l.text);

/** Build one occlusion card per group. Masks are uniform across the whole page. */
export function buildOcclusionCards(labels: Label[], groupSize: number): { cards: CheckedCardLike[]; groups: Label[][] } {
  const masks = uniformMasks(labels.map((l) => l.box));
  labels.forEach((l, i) => (l.mask = masks[i]));
  const groups = groupLabels(labels, groupSize);
  const cards = groups.map((g) => {
    const flags = g.flatMap((l) => l.flags);
    return {
      kind: "occlusion" as const,
      front: g.length === 1 ? "Name the hidden label." : `Name the ${g.length} hidden labels.`,
      back: g.map((l, i) => (g.length === 1 ? answerText(l) : `${i + 1}. ${answerText(l)}`)).join("\n"),
      citedSpanIds: [...new Set(g.flatMap((l) => l.spanIds))],
      occlusion: { spanIds: [...new Set(g.flatMap((l) => l.spanIds))], labelIds: g.map((l) => l.id) },
      check: { ok: true, needsConfirmation: flags.length > 0, needsModelCheck: false, problems: flags },
    };
  });
  return { cards, groups };
}

/** Masks for Anki export: one array of masks per card. */
export function groupMasks(groups: Label[][]): Rect[][] {
  return groups.map((g) => g.map((l) => l.mask!).filter(Boolean));
}
