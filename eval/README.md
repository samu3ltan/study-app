# Accuracy benchmark

Each page is a folder: `eval/benchmark/<subject>/<page-id>/` containing
- `page.jpg` or `page.png` (the photo; kept out of git unless you own it)
- `meta.json`: `{ "subject", "contentType", "source", "permission", "notes" }`
- `expected.json`: the labels a good result must contain, each with optional `aliases` and `group`
  (Claude drafts from the image text; Sam confirms medicine by setting `reviewedBy`; subject reviewers confirm the rest)

Scores reported per subject and content type: errors per 100 kept cards, mask precision/recall,
cards kept, time to an accepted deck. Run on every prompt, model or OS change.
