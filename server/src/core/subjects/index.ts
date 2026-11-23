import type { ContentType } from "../types.ts";

/**
 * A subject profile holds everything subject-specific. Adding a subject = adding a profile.
 * The pipeline, data model and apps never branch on subject names.
 */
export type SubjectProfile = {
  id: string;
  name: string;
  expects: ContentType[];
  promptGuidance: string; // added to the card-writing prompt
  /** Extra unit symbols to treat as "measured values needing confirmation". */
  extraUnits: string[];
  /** If true, any card whose answer contains a drug-like dose pattern needs confirmation. */
  checkDoses: boolean;
  /** Who can review benchmark accuracy for this subject. */
  reviewer: string;
};

const common = [
  "Only use facts visible on the page. Cite the OCR span ids that support each answer.",
  "One fact per card. Keep fronts short and unambiguous.",
  "Write math in LaTeX between \\( and \\).",
].join(" ");

export const SUBJECTS: Record<string, SubjectProfile> = {
  medicine: {
    id: "medicine",
    name: "Medicine",
    expects: ["labelled_diagram", "text_page", "table", "process_diagram", "clinical_image", "graph"],
    promptGuidance: `${common} For clinical images (ECG, histology, radiology) take answers only from printed labels or captions; never interpret the image yourself.`,
    extraUnits: ["mmHg", "bpm", "mEq/L", "mmol/L", "mg/dL", "IU", "U/L"],
    checkDoses: true,
    reviewer: "Sam",
  },
  biology: {
    id: "biology",
    name: "Biology",
    expects: ["labelled_diagram", "process_diagram", "text_page", "table", "graph"],
    promptGuidance: `${common} For cycles and pathways, keep steps in the order shown and make "what comes next" cards.`,
    extraUnits: ["bp", "kDa", "nm", "µm"],
    checkDoses: false,
    reviewer: "TBD (subject reviewer)",
  },
  chemistry: {
    id: "chemistry",
    name: "Chemistry",
    expects: ["chemical_structure", "equation", "table", "graph", "worked_problem", "text_page"],
    promptGuidance: `${common} Copy chemical names, formulas and reagents exactly as printed; never invent reagents or conditions.`,
    extraUnits: ["mol", "M", "kJ/mol", "atm", "pKa", "K"],
    checkDoses: false,
    reviewer: "TBD (subject reviewer)",
  },
  physics: {
    id: "physics",
    name: "Physics",
    expects: ["equation", "graph", "worked_problem", "labelled_diagram", "text_page"],
    promptGuidance: `${common} Keep symbols, units and sign conventions exactly as printed.`,
    extraUnits: ["N", "J", "W", "V", "A", "Ω", "Hz", "Pa", "m/s", "m/s^2"],
    checkDoses: false,
    reviewer: "TBD (subject reviewer)",
  },
};

export function getSubject(id: string): SubjectProfile {
  const s = SUBJECTS[id];
  if (!s) throw new Error(`Unknown subject profile: ${id}`);
  return s;
}
