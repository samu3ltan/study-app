# Decisions log

| Date | Decision | Why | Decided by |
| --- | --- | --- | --- |
| 2026-11-20 | Standalone platform with its own FSRS reviewer, not an Anki companion | Own the review loop and learning features | Sam |
| 2026-11-20 | Import premade decks (Anki .apkg/.colpkg incl. AnKing, CSV) with review history; imported decks stay private | Remove switching cost; shared-deck licenses are personal use | Sam |
| 2026-11-20 | Two creation modes: Learn and Fast | Keep the generation benefit while respecting time-pressed learners | Sam |
| 2026-11-20 | Speed bar: Fast mode >=5x faster than making cards by hand; Learn >=3x; <2x means stop | Competitors already deliver ~2x | Sam |
| 2026-11-20 | Native Apple apps first: iPhone, iPad, Mac together from one Swift/SwiftUI codebase, sync at launch; Windows/Android later | Best capture and review experience | Sam |
| 2026-11-20 | Build on Sam's MacBook Air in ~/Developer/StudyApp; Claude/agents are the technical staff | Sam has no coding experience | Sam |
| 2026-11-20 | Apple Developer Program: enroll as an individual | Fastest route; can move to a company later | Sam |
| 2026-11-20 | Sam reviews medical accuracy of benchmark cards; human security review under consideration | Domain expertise; AI-written security code needs a human check | Sam |
| 2026-11-20 | Product serves medicine AND the sciences (biology, chemistry, physics...) | Wider market; same core workflow | Sam |
| 2026-11-22 | Benchmark test setting: one hidden-label card hides 3-4 neighbouring labels (group size is a setting; hide-one stays available and will be compared) | Fewer cards to review; evidence favours hide-one, so both will be measured | Sam |
| 2026-11-22 | A multi-name label such as "Left anterior descending (LAD) (or interventricular) artery" counts as ONE label/card | Matches how the diagram presents it | Sam |

Proposed, not yet confirmed: beachhead = US M1/M2 students with labelled diagrams; free Anki export;
no ECG interpretation or patient data at launch; Free + Plus $7.99/mo or $49.99/yr.
| 2026-11-22 | Hidden-label boxes must never overlap each other; each box still covers its whole label. Boxes start the same size and are trimmed where neighbours would collide (labels that physically touch are flagged for review) | Overlapping boxes look messy and can hide a neighbour's label | Sam (requirement); Claude (method) |
