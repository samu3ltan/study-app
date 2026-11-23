import type { CardKind, CheckedCardLike, DraftCard, Label, OcrSpan } from "../core/types.ts";
import type { SubjectProfile } from "../core/subjects/index.ts";
import { checkCard } from "../core/verify.ts";

/**
 * Card writer: OCR spans -> draft cards (Anthropic Messages API, forced tool call for
 * structured JSON) -> deterministic checks. Dependency-free: uses global fetch.
 */

export type Mode = "learn" | "fast";

export type WriteOptions = {
  spans: OcrSpan[];
  subject: SubjectProfile;
  mode: Mode;
  apiKey: string;
  model?: string; // default: claude-haiku-5-5
  maxCards?: number; // cap per page to prevent card bloat (labels don't count)
  labels?: Label[]; // when given, labels are already covered: write text cards only
  fetchImpl?: typeof fetch;
};

export type CheckedCard = CheckedCardLike;

export const DEFAULT_MODEL = "claude-haiku-5-5";
const API_URL = "https://api.anthropic.com/v1/messages";

const CARD_TOOL = {
  name: "submit_cards",
  description: "Submit the flashcards made from this page.",
  input_schema: {
    type: "object",
    properties: {
      cards: {
        type: "array",
        items: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["basic", "cloze", "occlusion"] },
            front: { type: "string", description: "Question, or cloze text with {{c1::answer}}. For occlusion: a short prompt like 'Name the hidden label'." },
            back: { type: "string", description: "Answer. For occlusion: exactly the hidden label text." },
            citedSpanIds: { type: "array", items: { type: "string" }, minItems: 1 },
            occlusionSpanIds: { type: "array", items: { type: "string" }, description: "Occlusion only: the span id(s) of the label to hide." },
          },
          required: ["kind", "front", "back", "citedSpanIds"],
        },
      },
    },
    required: ["cards"],
  },
} as const;

export function buildRequest(opts: WriteOptions): Record<string, unknown> {
  const maxCards = opts.maxCards ?? 15;
  const system = [
    "You write spaced-repetition flashcards from ONE photographed study page.",
    "You only see the page as OCR spans: [id] text (position). Every fact must come from these spans.",
    "Never add knowledge that is not on the page. If something is unclear, skip it.",
    ...(opts.labels
      ? [
          `These diagram labels already have their own cards: ${opts.labels.map((l) => l.text).join("; ")}.`,
          "Do NOT make occlusion cards. Make only basic or cloze cards about OTHER facts on the page (for example what an abbreviation stands for, or how parts relate), and only when the page states them.",
        ]
      : [
          "Labels on a diagram (short names placed around a figure) become occlusion cards: back = the exact label text, occlusionSpanIds = that label's span id(s).",
          "Titles, figure captions and legends are not labels.",
        ]),
    "Never put the answer, or words from it, in the question.",
    'Do not make cards that only ask for another name, synonym or alternative term (e.g. "What is another name for X?", "X is also called ..."); the page already shows both names together.',
    `Make at most ${maxCards} cards, choosing the most important facts first.`,
    opts.mode === "learn"
      ? "Learn mode: prefer cards that ask how or why, plus the key labels."
      : "Fast mode: prefer short recall cards and labels; keep fronts very short.",
    `Subject guidance (${opts.subject.name}): ${opts.subject.promptGuidance}`,
    "Submit the cards with the submit_cards tool.",
  ].join("\n");

  const page = opts.spans
    .map((s) => `[${s.id}] ${s.text} (x=${s.box.left.toFixed(2)}, y=${s.box.top.toFixed(2)})`)
    .join("\n");

  return {
    model: opts.model ?? DEFAULT_MODEL,
    max_tokens: 4096,
    system,
    tools: [CARD_TOOL],
    tool_choice: { type: "tool", name: "submit_cards" },
    messages: [{ role: "user", content: `OCR spans for this page:\n${page}` }],
  };
}

const KINDS = new Set<CardKind>(["basic", "cloze", "occlusion"]);

/** Pull the cards out of a Messages API response; drop anything malformed. */
export function parseResponse(json: unknown): DraftCard[] {
  const content = (json as { content?: unknown[] })?.content;
  if (!Array.isArray(content)) throw new Error("Unexpected API response: no content array");
  const call = content.find(
    (b): b is { type: "tool_use"; name: string; input: { cards?: unknown } } =>
      typeof b === "object" && b !== null && (b as { type?: string }).type === "tool_use" && (b as { name?: string }).name === "submit_cards",
  );
  if (!call) throw new Error("Model did not call submit_cards");
  const raw = Array.isArray(call.input?.cards) ? call.input.cards : [];
  const cards: DraftCard[] = [];
  for (const c of raw as Array<Record<string, unknown>>) {
    if (!c || !KINDS.has(c.kind as CardKind) || typeof c.front !== "string" || typeof c.back !== "string") continue;
    const cited = Array.isArray(c.citedSpanIds) ? c.citedSpanIds.filter((x): x is string => typeof x === "string") : [];
    const card: DraftCard = { kind: c.kind as CardKind, front: c.front, back: c.back, citedSpanIds: cited };
    if (card.kind === "occlusion") {
      const ids = Array.isArray(c.occlusionSpanIds) ? c.occlusionSpanIds.filter((x): x is string => typeof x === "string") : [];
      card.occlusion = { spanIds: ids };
    }
    cards.push(card);
  }
  return cards;
}

export async function writeCards(opts: WriteOptions): Promise<{ cards: CheckedCard[]; usage?: unknown }> {
  const f = opts.fetchImpl ?? fetch;
  const res = await f(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(buildRequest(opts)),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${text.slice(0, 500)}`);
  }
  const json = (await res.json()) as { usage?: unknown };
  const spanMap = new Map(opts.spans.map((s) => [s.id, s]));
  const drafted = parseResponse(json).filter((c) => !(opts.labels && c.kind === "occlusion"));
  const cards = drafted.map((c) => ({ ...c, check: checkCard(c, spanMap, opts.subject) }));
  return { cards, usage: json.usage };
}
