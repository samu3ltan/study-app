import type { CheckResult, DraftCard, OcrSpan } from "./types.ts";
import type { SubjectProfile } from "./subjects/index.ts";

/**
 * Deterministic checks run on every AI-drafted card BEFORE the (paid) AI verifier.
 * Rule of thumb: anything that must be exact (labels, numbers, cloze answers) is checked
 * here in code; only fuzzy "is this sentence supported?" questions go to a model.
 */

const COMMON_UNITS = [
  "mg", "mcg", "µg", "g", "kg", "mL", "L", "dL", "mm", "cm", "m", "km",
  "s", "ms", "min", "h", "%", "°C", "°F", "mol", "mmol", "IU", "units",
];

/** Lowercase, unify unicode look-alikes, collapse spaces, drop thousands separators. */
export function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[−‒–—]/g, "-") // minus and dashes
    .replace(/μ/g, "µ") // Greek mu -> micro sign
    .replace(/(\d),(\d{3})(?!\d)/g, "$1$2") // 1,000 -> 1000
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.;:,]+$/, "")
    .toLowerCase();
}

/** Strip Markdown emphasis and LaTeX delimiters so comparisons see plain content. */
function plain(text: string): string {
  return text
    .replace(/\\\(|\\\)|\\\[|\\\]/g, " ")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ");
}

export function extractNumbers(text: string): string[] {
  const t = normalize(text);
  return t.match(/-?\d+(?:\.\d+)?/g) ?? [];
}

export function extractClozeAnswers(front: string): string[] {
  const out: string[] = [];
  const re = /\{\{c\d+::(.*?)(?:::.*?)?\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(front)) !== null) out.push(m[1]);
  return out;
}

function hasUnit(text: string, units: string[]): boolean {
  const t = text.normalize("NFKC");
  return units.some((u) => {
    const esc = u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\d\\s*${esc}(?![A-Za-z])`).test(t);
  });
}

const STOPWORDS = new Set(
  "the a an of to in on and or is are was were be by for with as at from that this which it its into than then".split(" "),
);

function contentWords(text: string): string[] {
  return normalize(plain(text))
    .split(/[^\p{L}\p{N}-]+/u)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

export function checkCard(
  card: DraftCard,
  spans: Map<string, OcrSpan>,
  subject: SubjectProfile,
): CheckResult {
  const problems: string[] = [];
  let ok = true;
  let needsConfirmation = false;
  let needsModelCheck = false;

  // 1. Every card must cite real spans.
  if (card.citedSpanIds.length === 0) {
    problems.push("Card cites no source text.");
    ok = false;
  }
  const missing = card.citedSpanIds.filter((id) => !spans.has(id));
  if (missing.length > 0) {
    problems.push(`Card cites unknown source spans: ${missing.join(", ")}.`);
    ok = false;
  }
  const cited = card.citedSpanIds
    .filter((id) => spans.has(id))
    .map((id) => spans.get(id)!.text)
    .join(" ");
  const citedNorm = normalize(plain(cited));

  // 2. Occlusion cards: the hidden answer must be exactly the label text.
  if (card.kind === "occlusion") {
    const ids = card.occlusion?.spanIds ?? [];
    if (ids.length === 0 || ids.some((id) => !spans.has(id))) {
      problems.push("Occlusion card does not point at real label spans.");
      ok = false;
    } else {
      const label = normalize(ids.map((id) => spans.get(id)!.text).join(" "));
      if (normalize(plain(card.back)) !== label) {
        problems.push(`Answer "${card.back}" does not match the label on the page ("${label}").`);
        ok = false;
      }
      const lowConf = ids.some((id) => spans.get(id)!.confidence < 0.8);
      if (lowConf) {
        problems.push("OCR is unsure about this label; please check the spelling.");
        needsConfirmation = true;
      }
    }
  }

  // 3. Cloze answers must appear verbatim in the cited text.
  if (card.kind === "cloze") {
    const answers = extractClozeAnswers(card.front);
    if (answers.length === 0) {
      problems.push("Cloze card has no {{c1::...}} deletion.");
      ok = false;
    }
    for (const a of answers) {
      if (!citedNorm.includes(normalize(plain(a)))) {
        problems.push(`Cloze answer "${a}" is not in the cited source text.`);
        ok = false;
      }
    }
  }

  // 4. Every number in the answer must appear in the cited text; numbers always need a tap.
  const answerText = card.kind === "cloze" ? extractClozeAnswers(card.front).join(" ") + " " + card.back : card.back;
  const nums = extractNumbers(plain(answerText));
  if (nums.length > 0) needsConfirmation = true;
  const sourceNums = new Set(extractNumbers(cited));
  for (const n of nums) {
    if (!sourceNums.has(n)) {
      problems.push(`The number ${n} is not in the cited source text.`);
      ok = false;
    }
  }

  // 5. Units, doses and math always need confirmation.
  if (hasUnit(answerText, [...COMMON_UNITS, ...subject.extraUnits])) needsConfirmation = true;
  if (/\\\(|\\\[/.test(card.front + card.back)) needsConfirmation = true;

  // 6. Basic cards: cheap lexical support check; weak support goes to the AI verifier.
  if (card.kind === "basic") {
    const words = contentWords(card.back);
    if (words.length > 0) {
      const supported = words.filter((w) => citedNorm.includes(w)).length / words.length;
      if (supported < 0.6) {
        problems.push("Answer wording is not clearly in the source; sent for AI verification.");
        needsModelCheck = true;
      }
    }
  }

  // 7. The question must not give away its own answer.
  if (card.kind === "occlusion") {
    const generic = new Set(["artery", "arteries", "veins", "hidden", "label", "labels", "structure"]);
    const front = normalize(plain(card.front));
    const leaked = contentWords(card.back).filter((w) => w.length >= 5 && !generic.has(w) && front.includes(w));
    if (leaked.length > 0) {
      problems.push(`The question gives away the answer ("${leaked[0]}").`);
      ok = false;
    }
  } else {
    const frontPlain = normalize(plain(card.kind === "cloze" ? card.front.replace(/\{\{c\d+::.*?\}\}/g, " ") : card.front));
    const answers = card.kind === "cloze" ? extractClozeAnswers(card.front) : [card.back];
    for (const a of answers) {
      const an = normalize(plain(a));
      if (an.length >= 4 && frontPlain.includes(an)) {
        problems.push("The question gives away its own answer.");
        ok = false;
        break;
      }
    }
  }

  // 8. No "another name for X" cards (Sam, 2026-11-22): the page shows both names together,
  // so these add reviews without adding learning.
  if (card.kind !== "occlusion" && ALT_NAME.test(plain(card.front))) {
    problems.push('Cards asking for "another name" or a synonym are not made.');
    ok = false;
  }

  return { ok, needsConfirmation, needsModelCheck, problems };
}

const ALT_NAME = /\b(another|other|alternative|alternate)\s+(name|term)s?\b|\bsynonyms?\b|\balso\s+(called|known\s+as|termed|referred\s+to\s+as)\b/i;
