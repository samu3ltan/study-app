# Accuracy benchmark

Each page is a folder: `eval/benchmark/<subject>/<page-id>/` containing
- `page.jpg` (the photo; kept out of git unless you own it)
- `meta.json`: `{ "subject", "contentType", "source", "permission", "notes" }`
- `expected.json`: the labels/cards a good result must contain (Sam fills medicine; subject reviewers fill the rest)

Scores reported per subject and content type: errors per 100 kept cards, mask precision/recall,
cards kept, time to an accepted deck. Run on every prompt, model or OS change.
