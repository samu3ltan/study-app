// Usage (from the server folder):
//   node scripts/cards-from-ocr.ts <page.ocr.json> --subject medicine [--mode fast|learn]
// Reads OCR output from tools/ocr, writes <page>.cards.json next to it and prints a summary.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../src/pipeline/env.ts";
import { writeCards, type Mode } from "../src/pipeline/cardWriter.ts";
import { getSubject } from "../src/core/subjects/index.ts";
import type { OcrSpan } from "../src/core/types.ts";

const here = dirname(fileURLToPath(import.meta.url));
loadEnv(join(here, "..", "..", ".env"));

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
if (!file) {
  console.error("Usage: node scripts/cards-from-ocr.ts <page.ocr.json> --subject medicine [--mode fast|learn]");
  process.exit(2);
}
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("ANTHROPIC_API_KEY is missing. Paste it into the .env file in the StudyApp folder.");
  process.exit(2);
}

const page = JSON.parse(readFileSync(resolve(file), "utf8")) as { spans: OcrSpan[] };
const subject = getSubject(flag("subject", "medicine"));
const mode = flag("mode", "fast") as Mode;

const { cards, usage } = await writeCards({ spans: page.spans, subject, mode, apiKey });
const out = resolve(file).replace(/\.ocr\.json$/, "") + ".cards.json";
writeFileSync(out, JSON.stringify({ subject: subject.id, mode, usage, cards }, null, 2));

const passed = cards.filter((c) => c.check.ok);
const confirm = passed.filter((c) => c.check.needsConfirmation).length;
const modelCheck = passed.filter((c) => c.check.needsModelCheck).length;
console.log(`${cards.length} cards drafted, ${passed.length} passed checks (${confirm} need a tap to confirm, ${modelCheck} need AI verification), ${cards.length - passed.length} rejected.`);
for (const c of cards.filter((c) => !c.check.ok)) console.log(`  rejected: ${c.front} -> ${c.back} | ${c.check.problems.join(" ")}`);
console.log(`Saved to ${out}`);
