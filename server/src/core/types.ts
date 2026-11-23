// Core, subject-neutral types shared by the card pipeline.
// Nothing here may assume medicine: subject-specific behavior lives in subjects/.

/** A normalized rectangle, top-left origin, all values 0..1 of the image size. */
export type Rect = { left: number; top: number; width: number; height: number };

/** One word inside an OCR line, with its own box (so a mask can cover part of a line). */
export type OcrWord = { id: string; text: string; box: Rect }; // id like "s22.w1"

/** One line of text found by OCR, with its position on the page. */
export type OcrSpan = {
  id: string; // stable within one page, e.g. "s12"
  text: string;
  box: Rect; // top-left origin (convert Apple Vision boxes with fromVisionBox)
  confidence: number; // 0..1
  words?: OcrWord[]; // present from OCR tool v2
};

/** A diagram label: one or more OCR words that name one structure. */
export type Label = {
  id: string; // "L1", "L2", ...
  wordIds: string[];
  spanIds: string[];
  text: string; // label as printed (may correct an OCR misread; then corrected = true)
  ocrText: string; // what OCR read
  corrected: boolean;
  sharedDescription?: string; // e.g. "Left marginal arteries" for codes M1/M2
  box: Rect; // union of the word boxes
  cover?: Rect; // area to hide: the label plus any leftover words on its lines (e.g. "Left marginal" next to "M1")
  mask?: Rect; // uniform-size mask for this label (set when cards are built)
  flags: string[]; // things the user must confirm
};

export type ContentType =
  | "text_page"
  | "labelled_diagram"
  | "process_diagram"
  | "table"
  | "equation"
  | "chemical_structure"
  | "graph"
  | "worked_problem"
  | "clinical_image";

export type CardKind = "basic" | "cloze" | "occlusion";

/** A card proposed by the AI. Answers must be traceable to OCR spans on the source page. */
export type DraftCard = {
  kind: CardKind;
  front: string; // Markdown + LaTeX allowed
  back: string; // Markdown + LaTeX allowed
  citedSpanIds: string[]; // which OCR spans support the answer
  occlusion?: { spanIds: string[]; labelIds?: string[] }; // for kind === "occlusion": the label(s) being hidden
};

export type CheckResult = {
  ok: boolean; // false = drop or send back for regeneration
  needsConfirmation: boolean; // true = user must tap to confirm (numbers, units, formulas)
  needsModelCheck: boolean; // true = cheap checks can't confirm support; run the AI verifier
  problems: string[]; // human-readable reasons, shown in triage and logged for evaluation
};

/** A card plus the result of its checks. */
export type CheckedCardLike = DraftCard & { check: CheckResult };
