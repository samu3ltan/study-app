// Core, subject-neutral types shared by the card pipeline.
// Nothing here may assume medicine: subject-specific behavior lives in subjects/.

/** A normalized rectangle, top-left origin, all values 0..1 of the image size. */
export type Rect = { left: number; top: number; width: number; height: number };

/** One piece of text found by OCR, with its position on the page. */
export type OcrSpan = {
  id: string; // stable within one page, e.g. "s12"
  text: string;
  box: Rect; // top-left origin (convert Apple Vision boxes with fromVisionBox)
  confidence: number; // 0..1
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
  occlusion?: { spanIds: string[] }; // for kind === "occlusion": the label(s) being hidden
};

export type CheckResult = {
  ok: boolean; // false = drop or send back for regeneration
  needsConfirmation: boolean; // true = user must tap to confirm (numbers, units, formulas)
  needsModelCheck: boolean; // true = cheap checks can't confirm support; run the AI verifier
  problems: string[]; // human-readable reasons, shown in triage and logged for evaluation
};
