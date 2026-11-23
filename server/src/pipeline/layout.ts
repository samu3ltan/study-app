import type { OcrSpan } from "../core/types.ts";
import type { SubjectProfile } from "../core/subjects/index.ts";
import { buildLabels, type LabelResult, type RawLabel } from "../core/labels.ts";
import { callTool, toolInput, type ImageBlock, type TextBlock } from "./anthropic.ts";

/**
 * Layout step: page image + OCR words -> which words form each diagram label.
 * The model may only point at OCR word ids. It may fix an obvious OCR misread in the label
 * text (checked in buildLabels: small edits only, and the user must confirm).
 */

export const LABEL_TOOL = {
  name: "submit_labels",
  description: "Submit every label on the diagram.",
  input_schema: {
    type: "object",
    properties: {
      labels: {
        type: "array",
        items: {
          type: "object",
          properties: {
            wordIds: { type: "array", items: { type: "string" }, minItems: 1, description: "OCR WORD ids (like \"s22.w1\", not line ids like \"s22\") that make up this label, in reading order." },
            text: { type: "string", description: "Read this label directly from the IMAGE, letter by letter. Do not just copy the OCR text: OCR can add a letter where a pointer line touches a word (\"Aortal\" for \"Aorta\") or add stray punctuation." },
            sharedDescription: { type: "string", description: "Only for short codes that share one description, e.g. M1 and M2 sharing 'Left marginal arteries'." },
          },
          required: ["wordIds", "text"],
        },
      },
    },
    required: ["labels"],
  },
} as const;

export function layoutSystemPrompt(subject: SubjectProfile): string {
  return [
    "You look at a study diagram and its OCR words, and list every LABEL on the diagram.",
    "A label is text that names a part of the figure, usually connected to it by a line or arrow, or placed right next to it.",
    "Titles, figure captions, legends, page numbers and paragraphs are NOT labels.",
    "A label often wraps over several lines: include all of its words in reading order.",
    "Keep a full name and its abbreviation together as one label, e.g. 'Right coronary artery (RCA)'.",
    "When several short codes share one description (e.g. 'M1', 'M2' next to 'Left marginal arteries'), make each code its own label containing only the code's word id, and put the description in sharedDescription. Do not include the description words in any label.",
    "For each label's text, read the IMAGE letter by letter. OCR sometimes misreads a character or picks up part of a pointer line as a letter or a dot; when the image differs from the OCR text, write what the image shows. Never rename, expand or reword a label.",
    "Refer to words by their word ids (e.g. s22.w1), not line ids.",
    "Use each word id at most once. Do not invent word ids.",
    `Subject: ${subject.name}.`,
  ].join("\n");
}

export function pageWordsText(spans: OcrSpan[]): string {
  return spans
    .map((s) => {
      const words = s.words && s.words.length > 0 ? s.words : [{ id: s.id, text: s.text, box: s.box }];
      return `line ${s.id} (x=${s.box.left.toFixed(2)}, y=${s.box.top.toFixed(2)}): ${words.map((w) => `${w.id}="${w.text}"`).join(" ")}`;
    })
    .join("\n");
}

export type LayoutOptions = {
  spans: OcrSpan[];
  subject: SubjectProfile;
  apiKey: string;
  image?: { base64: string; mediaType: string };
  model?: string;
  fetchImpl?: typeof fetch;
};

export async function findLabels(o: LayoutOptions): Promise<LabelResult & { usage?: unknown }> {
  const content: Array<ImageBlock | TextBlock> = [];
  if (o.image) content.push({ type: "image", source: { type: "base64", media_type: o.image.mediaType, data: o.image.base64 } });
  content.push({ type: "text", text: `OCR words on this page:\n${pageWordsText(o.spans)}` });
  const { json, usage } = await callTool({
    apiKey: o.apiKey,
    model: o.model ?? "claude-haiku-5-5",
    system: layoutSystemPrompt(o.subject),
    content,
    tool: LABEL_TOOL as unknown as { name: string; description: string; input_schema: Record<string, unknown> },
    fetchImpl: o.fetchImpl,
  });
  const input = toolInput(json, "submit_labels");
  const raw = (Array.isArray(input.labels) ? input.labels : []) as RawLabel[];
  return { ...buildLabels(raw, o.spans), usage };
}
