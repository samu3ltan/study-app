# Server (TypeScript)

AI card pipeline, verification, Anki import/export (ankipack), FSRS history replay (ts-fsrs), sync API.

## Run the tests
Requires Node 22.18+ (runs TypeScript directly, no build step).

    npm test

## What exists so far
- `src/core/types.ts`: subject-neutral card, OCR span and check-result types
- `src/core/geometry.ts`: Apple Vision box conversion (bottom-left -> top-left), multi-word label
  boxes, uniform mask sizing, Anki native image-occlusion field format
- `src/core/subjects/`: subject profiles (medicine, biology, chemistry, physics)
- `src/core/verify.ts`: deterministic card checks run before any AI verifier
  - occlusion answers must equal the OCR label exactly
  - cloze answers must appear verbatim in the cited source text
  - every number in an answer must appear in the source; numbers, units and math need a tap to confirm
  - cards citing no or unknown source text are rejected
  - weakly supported wording is routed to the AI verifier

- `src/pipeline/cardWriter.ts`: OCR spans -> Anthropic (Claude Haiku 5.5) -> draft cards -> verifier
- `scripts/cards-from-ocr.ts`: run one page end to end from the OCR JSON made by `../tools/ocr`

## Run one page (from the StudyApp folder)
    swift build -c release --package-path tools/ocr
    P=eval/benchmark/medicine/page-001
    tools/ocr/.build/release/ocr $P/page.png --small $P/page.small.jpg > $P/page.ocr.json
    cd server && node scripts/run-page.ts ../$P --subject medicine --mode fast --group 4
Writes `page.cards.json` and a plain-language `page.report.md` into the page folder.
To see the cards as a student would: `node scripts/preview-cards.ts ../$P` (writes `page.preview.html`).

## Next
1. Compile and test `../tools/ocr` on the Mac
2. Send the page image too (not just OCR text) for label/caption decisions; compare Gemini Flash
3. Benchmark runner over `../eval/benchmark`
4. .apkg export with native image occlusion
