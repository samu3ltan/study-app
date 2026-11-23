# Evaluation log

## 2026-11-22 · Run 1 · medicine/page-001 (coronary arteries) · Fast mode · Claude Haiku 5.5

Pipeline: Apple Vision OCR (tools/ocr) -> card writer (OCR text only, no image) -> deterministic verifier.
Raw outputs: `eval/benchmark/medicine/page-001/runs/2026-11-22-run1/`.

| Measure | Result |
| --- | --- |
| OCR | 29 text lines, all 17 labels found; 2 misreads at 100% reported confidence ("Aortal" = leader line read as "l"; stray "." after "(or interventricular)") |
| Cards drafted / passed / rejected | 15 / 13 / 2 |
| Labels correctly turned into occlusion cards | 4 of 17 (SVC, RCA, PDA, RMA) |
| Wrong cards that passed the verifier | 1 ("Aortal" copied from the OCR misread) |
| Grouping errors | 2 ("M1 Left marginal", "D1 Diagonal" merge a code with half a description) |
| Labels missed entirely | 8 (right atrium, right/left ventricle, left pulmonary artery/veins, LCA, M2, D2) |
| Fronts that give away the answer | 3 (e.g. "aorta origin", "posterior descending artery", "right marginal branch") |
| Correct rejections | 2 (model rephrased LAD and Cx labels instead of copying them) |
| Cost | 1,786 input + 1,118 output tokens, about $0.0007 |

### Fixes built (2026-11-22, pending run 2)
1. Occlusion cards made by code, not the model: one card per label, and labels don't count toward the card cap.
   The model only groups OCR lines into labels and splits shared codes (M1/M2, D1/D2).
2. Send the page image with the OCR text so the model can spot OCR misreads; any corrected label text
   is shown to the user and needs a tap to confirm.
3. New verifier rule: reject a card whose front contains its own answer.
4. OCR clean-up flags: stray single characters at the end of a label near a line ("l", "|", ".") need confirmation.

Built: OCR v2 (word boxes + small JPEG for the AI), layout step with the page image (`src/pipeline/layout.ts`),
code-built hidden-label cards with uniform masks and grouping (`src/core/labels.ts`, default group size 1;
this test uses 4), "question gives away the answer" rule, answer-key scoring (`src/eval/score.ts`),
one-command runner `scripts/run-page.ts` with a plain-language report. 35 tests pass.

## 2026-11-22 · Run 2 · medicine/page-001 · Fast mode · group size 4 · Claude Haiku 5.5 (image + OCR words)

Result: **0 of 17 labels**. The model named all 17 labels correctly but referred to whole lines ("s1")
instead of word ids ("s1.w1"), so the label safety check refused every one. It also copied "Aortal"
from OCR instead of reading the image. 8 text cards (abbreviations) all passed.

Fix: line ids are now accepted and narrowed to the matching words (e.g. "M1" inside "M1 Left marginal");
the prompt insists on word ids and on reading label text from the image letter by letter.
Replaying run 2's model output through the fixed code gives **16 of 17** (only "Aortal" wrong) and 5 cards of 3-4 labels.
Open issue: OCR artifacts the model doesn't correct ("Aortal"). Next idea if run 3 still misses it: a dedicated
check that re-reads each label from a crop of the image.

## 2026-11-22 · Run 3 · medicine/page-001 · Fast mode · group size 4 · Claude Haiku 5.5 (image + OCR words)

Run in Claude Code on the Mac (OCR v2 rebuilt; 36 tests pass). Raw outputs: `eval/benchmark/medicine/page-001/runs/2026-11-22-run3/`.
The replay of run 2 through the fixed code (what was in the page folder before run 3) is saved as `runs/2026-11-22-run2/page.*.replay.*`.
`runs/2026-11-22-run3/` holds run 3 as produced; the page folder's `page.cards.json` has run 3 with the newer boxes below.

| Measure | Result |
| --- | --- |
| Labels found | **17 of 17**, none rejected by the label safety check |
| Hidden-label cards | 5 (4, 3, 4, 3, 3 labels) |
| "Aortal" | corrected to "Aorta" from the image, shown to Sam for a tap to confirm |
| Stray "." in the LAD label | removed, shown to Sam for a tap to confirm |
| Text cards | 7: 6 abbreviation cards passed; 1 ("another name for the LAD artery?" → "Interventricular artery") flagged "needs AI check" |
| Tokens | layout 3,226 in / 776 out; text cards 1,962 in / 395 out |

Open: the "needs AI check" step is only a flag; no second AI pass runs yet, so flagged cards stay unverified.
Grouping splits the page by region but some groups have 3 labels (17 isn't divisible by 4). Awaiting Sam's medical review.

### Change after run 3 (2026-11-22): no overlapping boxes
Sam asked that hidden-label boxes never overlap. New `separateMasks`/`pageMasks` in `src/core/geometry.ts` trims
uniform boxes along a line halfway between neighbouring labels. On page-001: 20 overlapping pairs → 0; all boxes keep the
same width, heights vary (0.048–0.168 of the page) where labels are stacked. Run 3's cards were re-masked without a new AI
call. `scripts/preview-cards.ts` shows cards as a student sees them. 38 tests pass.

### Change (2026-11-22): boxes hide whole lines of text
Sam saw text peeking out beside the D1, D2 and M1 boxes. Cause: a box covered only the code ("M1") and cut through the
description beside it ("Left marginal"). Fix: a label's box now also hides the leftover words on its own lines
(`addCovers` in `src/core/labels.ts`). The OCR boxes of tightly stacked lines overlap slightly, so a small overlap is now split
down the middle instead of giving up (`separateMasks`). Checked by drawing the boxes on the page: all text hidden, 0 overlaps;
a pinpoint of the "g" in "marginal" can show where the M1 and M2 lines touch. 40 tests pass.
