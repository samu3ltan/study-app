# Working agreement for Claude and agents

## Roles
- **Founder (Sam):** no coding experience. Makes product, business and budget decisions,
  tests builds on real devices, reviews medical accuracy of benchmark cards, handles accounts,
  payments and legal agreements.
- **Claude / agents:** the technical staff. Write all code, tests, infrastructure and docs.
  Propose technical decisions as 2-3 plain-language options with a recommendation; never make
  a product, pricing, legal or spending decision alone.

## Every session
1. Read `docs/decisions.md` and `docs/setup-checklist.md` before doing anything.
2. Work in small, reviewable steps; commit with clear messages.
3. End with a short plain-language summary for Sam: what changed, what to test, decisions needed.
4. Record any new decision in `docs/decisions.md` (date, decision, why, who decided).

## Hard rules
- Never commit secrets. Keys live only in `.env` (git-ignored) or the macOS keychain.
- Never send patient data or identifiable images to AI providers.
- Every AI-generated card must link to its source region; no answer text that isn't in the source.
- The product serves medicine AND the sciences: never hard-code medical assumptions into the
  data model, prompts or UI. Subject-specific behavior goes in subject profiles (`docs/subjects.md`).
- Don't copy code from Anki or Image Occlusion Enhanced (AGPL). Check licenses before adding a dependency.

## Plans (claude.ai)
- Business plan: https://claude.ai/artifact/GVA18M87rwkyqMhXhK5gGD
- Technical plan: https://claude.ai/artifact/YJHrSuPrvffaXxk5vkVXn2
- Evidence base: https://claude.ai/artifact/XVG8dvpezbVvihTzcqDEod

## Build order
1. Phase 0: `server/` AI pipeline + `eval/` benchmark + .apkg export (enables the hand-run pilot).
2. Then `apple/`: multiplatform SwiftUI app, first TestFlight build to Sam's iPhone.

## Status (2026-11-22)
- `server/`: core types, Vision box geometry, Anki image-occlusion format, subject profiles,
  deterministic card verifier, Anthropic card writer (dependency-free, uses fetch, forced tool call
  for JSON), `.env` loader, CLI `scripts/cards-from-ocr.ts`. 20 tests pass (`cd server && npm test`).
- `tools/ocr/`: Swift command-line OCR using Apple Vision. Written in a Linux sandbox, NEVER COMPILED:
  the first Mac session must build it and fix any compile errors.
- GitHub: `samu3ltan/study-app` (private). The first commit was made in the chat sandbox; pushing needs
  the Claude GitHub App to have access to this repo.

## First Claude Code session on the Mac (do these in order)
1. Check tools: `xcodebuild -version`, `swift --version`, `node --version` (need 22.18+), `git --version`.
   If Node is missing or old, ask Sam before installing it.
2. Connect this folder to GitHub: if `.git` is missing, `git init -b main`,
   `git remote add origin https://github.com/samu3ltan/study-app.git`, `git fetch origin`,
   then `git reset origin/main` (keeps local files; check `git status` shows no unexpected changes).
   If origin/main doesn't exist yet, commit everything here and push.
3. `cd server && npm test`: all tests must pass on the Mac too.
4. `swift build -c release --package-path tools/ocr`; fix compile errors if any.
5. Check `.env` has ANTHROPIC_API_KEY (don't print it). Run the first page:
   `swift run -c release --package-path tools/ocr ocr eval/benchmark/<subject>/<page>/page.jpg > eval/benchmark/<subject>/<page>/page.ocr.json`
   then `cd server && node scripts/cards-from-ocr.ts ../eval/benchmark/<subject>/<page>/page.ocr.json --subject <subject>`.
6. Show Sam the cards and every problem the verifier found, in plain language. Ask what looks wrong.
