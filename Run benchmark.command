#!/bin/bash
# Double-click this file in Finder to run every benchmark page:
#   1. rebuild the page reader (Apple Vision OCR)
#   2. read each page under eval/benchmark/<subject>/page-*/
#   3. make cards with the AI and score them against the answer key
# Results: each page folder gets page.report.md; the full log goes to eval/last-run.log.
# It only reads and writes inside this StudyApp folder.

cd "$(dirname "$0")" || exit 1
LOG="eval/last-run.log"
{
  echo "Run started $(date)"
  if ! command -v node >/dev/null 2>&1; then echo "Node is not installed."; exit 1; fi
  swift build -c release --package-path tools/ocr || { echo "Page reader build failed."; exit 1; }
  for P in eval/benchmark/*/page-*; do
    IMG=""
    for f in page.png page.jpg page.jpeg page.heic; do
      if [ -f "$P/$f" ]; then IMG="$P/$f"; break; fi
    done
    [ -z "$IMG" ] && continue
    SUBJECT=$(basename "$(dirname "$P")")
    echo ""
    echo "== $P ($SUBJECT)"
    tools/ocr/.build/release/ocr "$IMG" --small "$P/page.small.jpg" > "$P/page.ocr.json" || { echo "Page reader failed for $P"; continue; }
    (cd server && node scripts/run-page.ts "../$P" --subject "$SUBJECT" --mode fast --group 4)
  done
  echo ""
  echo "Run finished $(date)"
} 2>&1 | tee "$LOG"
echo ""
echo "All done. You can close this window and tell Claude \"done\"."
