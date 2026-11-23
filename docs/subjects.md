# Designing for medicine and the sciences

The core pipeline (capture -> OCR -> classify -> generate -> verify -> review) is subject-neutral.
Everything subject-specific lives in a **subject profile**, so adding chemistry or physics never
means changing the data model or the app.

## Subject profile (one JSON/TS file per subject)
- `id`, `name`, `examples` (2-5 gold cards used in prompts)
- `contentTypes` it expects (see below) and per-type prompt guidance
- `verifiers`: extra checks (units, formulas, doses, chemical names)
- `cardStyles`: preferred card shapes (e.g. "name the structure", "predict the product")
- `reviewers`: who can check accuracy for the benchmark (Sam = medicine)

Initial profiles: medicine (anatomy, histology, physiology, pharmacology), biology,
chemistry, physics. Users can pick a subject per deck; the classifier also guesses it.

## Content types the pipeline must handle
| Content type | Example | Card shapes | Verification |
| --- | --- | --- | --- |
| Labelled diagram | Anatomy plate, cell diagram, circuit | Image occlusion (hide-one) | Answer == OCR span |
| Process / cycle diagram | Krebs cycle, life cycle, signalling pathway | Occlude a step; "what comes next" | Steps must appear in source order |
| Text page | Lecture notes, textbook | Cloze, Q&A | Cited spans support the answer |
| Table | Drug classes, periodic trends, constants | Row/column recall | Cell text verbatim |
| Equation / formula | Ideal gas law, Henderson-Hasselbalch, Ohm's law | Cloze on a term; "what does X represent" | Symbols and units match source exactly |
| Chemical structure / reaction | Functional groups, mechanisms | Occlude product/reagent; name the group | Names verbatim; no invented reagents |
| Graph / plot | Dose-response, titration curve, v-t graph | Axis meaning, trend, labelled points | Only features labelled in source |
| Worked problem | Physics or chem calculation | "Next step" cards | Numbers and units verbatim |
| Clinical image (ECG, histology plate) | Labelled ECG strip | Answer from printed label only | No model diagnosis |

## Build implications
- Card text fields support **Markdown + LaTeX math** everywhere; render math natively in Swift.
  Export math to Anki as MathJax `\( ... \)` so cards stay correct in Anki.
- Numbers, units, doses and formulas always need an explicit tap to confirm (all subjects).
- The benchmark covers every profile: start with ~30 pages (about 15 medicine, 5 each biology,
  chemistry, physics) and grow to 100-200.
- Accuracy reviewers: Sam for medicine; recruit a subject reviewer (TA or grad student) for each
  science profile before marketing to that subject.
- Marketing beachhead can stay medical while the product stays general.
