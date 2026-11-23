import type { Label } from "../core/types.ts";
import { normalize } from "../core/verify.ts";

export type Expected = { reviewedBy?: string | null; labels: Array<{ text: string; aliases?: string[]; group?: string }> };

export type LabelScore = {
  expected: number;
  matched: Array<{ expected: string; got: string; corrected: boolean }>;
  missed: string[];
  extra: string[]; // labels we produced that are not in the answer key (possible errors)
  recall: number; // matched / expected
};

/** Compare produced labels with the reviewed answer key (text or any alias, after normalization). */
export function scoreLabels(labels: Label[], expected: Expected): LabelScore {
  const keys = expected.labels.map((e) => ({ e, names: [e.text, ...(e.aliases ?? [])].map(normalize) }));
  const used = new Set<string>();
  const matched: LabelScore["matched"] = [];
  const extra: string[] = [];
  for (const l of labels) {
    const n = normalize(l.text);
    const hit = keys.find((k) => !used.has(k.e.text) && k.names.includes(n));
    if (hit) {
      used.add(hit.e.text);
      matched.push({ expected: hit.e.text, got: l.text, corrected: l.corrected });
    } else extra.push(l.text);
  }
  const missed = expected.labels.filter((e) => !used.has(e.text)).map((e) => e.text);
  return { expected: expected.labels.length, matched, missed, extra, recall: expected.labels.length ? matched.length / expected.labels.length : 0 };
}
