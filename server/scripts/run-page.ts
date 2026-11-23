// Run one benchmark page end to end.
// Usage (from the server folder):
//   node scripts/run-page.ts ../eval/benchmark/medicine/page-001 --subject medicine [--mode fast|learn] [--group 4] [--max-text 8]
// Needs page.ocr.json (and ideally page.small.jpg) from tools/ocr in the page folder.
// Writes page.cards.json and page.report.md (plain-language report) to the page folder.
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../src/pipeline/env.ts";
import { findLabels } from "../src/pipeline/layout.ts";
import { writeCards, type Mode } from "../src/pipeline/cardWriter.ts";
import { buildOcclusionCards } from "../src/core/labels.ts";
import { getSubject } from "../src/core/subjects/index.ts";
import { scoreLabels, type Expected } from "../src/eval/score.ts";
import type { OcrSpan } from "../src/core/types.ts";

const here = dirname(fileURLToPath(import.meta.url));
loadEnv(join(here, "..", "..", ".env"));

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a) && !["fast", "learn"].includes(a));
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
if (!dir) {
  console.error("Usage: node scripts/run-page.ts <page folder> --subject medicine [--mode fast|learn] [--group 4] [--max-text 8]");
  process.exit(2);
}
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("ANTHROPIC_API_KEY is missing. Paste it into the .env file in the StudyApp folder.");
  process.exit(2);
}

const pageDir = resolve(dir);
const page = JSON.parse(readFileSync(join(pageDir, "page.ocr.json"), "utf8")) as { spans: OcrSpan[] };
const subject = getSubject(flag("subject", "medicine"));
const mode = flag("mode", "fast") as Mode;
const groupSize = Number(flag("group", "1"));
const maxText = Number(flag("max-text", "8"));

// Image for the layout step: the small JPEG from tools/ocr, else the original if small enough.
let image: { base64: string; mediaType: string } | undefined;
for (const [name, type] of [["page.small.jpg", "image/jpeg"], ["page.png", "image/png"], ["page.jpg", "image/jpeg"]] as const) {
  const p = join(pageDir, name);
  if (existsSync(p) && statSync(p).size < 4_500_000) {
    image = { base64: readFileSync(p).toString("base64"), mediaType: type };
    break;
  }
}
if (!image) console.warn("No image under 4.5 MB found; the layout step will use OCR text only.");

const layout = await findLabels({ spans: page.spans, subject, apiKey, image });
const { cards: occlusionCards, groups } = buildOcclusionCards(layout.labels, groupSize);
const text = await writeCards({ spans: page.spans, subject, mode, apiKey, labels: layout.labels, maxCards: maxText });

const expectedPath = join(pageDir, "expected.json");
const score = existsSync(expectedPath)
  ? scoreLabels(layout.labels, JSON.parse(readFileSync(expectedPath, "utf8")) as Expected)
  : undefined;

const allCards = [...occlusionCards, ...text.cards];
writeFileSync(
  join(pageDir, "page.cards.json"),
  JSON.stringify(
    { subject: subject.id, mode, groupSize, labels: layout.labels, rejectedLabels: layout.rejected, groups: groups.map((g) => g.map((l) => l.id)), cards: allCards, score, usage: { layout: layout.usage, text: text.usage } },
    null,
    2,
  ),
);

// Plain-language report for Sam.
const lines: string[] = [];
lines.push(`# Results: ${pageDir.split("/").slice(-2).join("/")}`, "");
if (score) {
  lines.push(`**Labels found: ${score.matched.length} of ${score.expected}** (${Math.round(score.recall * 100)}%).`);
  if (score.missed.length) lines.push(`Missed: ${score.missed.join("; ")}.`);
  if (score.extra.length) lines.push(`Not in the answer key (check these): ${score.extra.join("; ")}.`);
  lines.push("");
}
lines.push(`## Hidden-label cards (${occlusionCards.length}, ${groupSize} label${groupSize === 1 ? "" : "s"} per card)`, "");
occlusionCards.forEach((c, i) => {
  lines.push(`${i + 1}. ${c.front}`);
  for (const a of c.back.split("\n")) lines.push(`   - ${a}`);
  for (const p of c.check.problems) lines.push(`   - ⚠️ ${p}`);
});
lines.push("", `## Text cards (${text.cards.length})`, "");
text.cards.forEach((c, i) => {
  const status = !c.check.ok ? "REJECTED" : c.check.needsConfirmation ? "needs your tap" : c.check.needsModelCheck ? "needs AI check" : "ok";
  lines.push(`${i + 1}. [${status}] ${c.front} → ${c.back}`);
  for (const p of c.check.problems) lines.push(`   - ${p}`);
});
if (layout.rejected.length) {
  lines.push("", "## Labels the safety check refused", "");
  for (const r of layout.rejected) lines.push(`- "${r.raw.text}": ${r.reason}`);
}
writeFileSync(join(pageDir, "page.report.md"), lines.join("\n") + "\n");

const passed = text.cards.filter((c) => c.check.ok).length;
console.log(
  `${layout.labels.length} labels -> ${occlusionCards.length} hidden-label cards; ${text.cards.length} text cards (${passed} passed).` +
    (score ? ` Labels found: ${score.matched.length}/${score.expected}.` : ""),
);
console.log(`Report: ${join(pageDir, "page.report.md")}`);
