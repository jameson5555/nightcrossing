# Historical puzzle cleanup — November 3, 2026

Reviewed the complete 228-puzzle catalog against the current content, hint,
answer-accessibility, theme, connectivity, and crossing requirements. The initial
full quality audit found 155 failing puzzles. Matching each published hint to its
trusted source and checking theme relevance identified further editorial repairs.

| Result | Puzzles |
| --- | ---: |
| New grids using vetted words | 154 |
| Clue and hint repairs retaining the grid | 17 |
| Unchanged | 57 |
| Total | 228 |

The current catalog contains 1,599 entries, with a hint for every answer and no
repeated answers within a theme. Dictionary alternate-sense hints were replaced
with reviewed same-sense hints or verified first/last-letter guidance. New grids
use reviewed vocabulary and vetted historical entries; the existing structural
and accessibility thresholds were retained.

Additional reviewed words replenish the pools used by future monthly generation.
All 1,730 editorially reviewed source entries pass the entry validator. Readiness
preflight passes for all scheduled themes and the three replacement candidates,
including the rolling reserve for one future batch.

## Saved progress

- Every original puzzle payload is preserved, including its ID, grid, numbering,
  answers, clues, hints, and existing layout revision. Only an edition pointer is
  added. The catalog still contains the same 228 IDs.
- New editions are immutable files under `public/data/puzzles/editions/`.
- An untouched puzzle opens its current improved edition.
- An existing started puzzle opens the original edition matching its saved
  letters, unlocked hints, revealed cells, and free-hint usage.
- Completed puzzles keep their completion credit and remain completed in the
  menu, theme progress, and journey progression. Replaying is not required.
- Starting an improved edition records its path before gameplay can save state.
  Later updates keep that saved game on the same edition.
- Neither catalog version changes nor layout revision changes delete player
  data. Hint balances, reward records, timers, theme progress, and ranks remain.
- The legacy reset version remains `bb837de6de25538c`. Old open browser clients
  can continue using the original puzzle URLs and layouts.

The [machine-readable audit](historical-puzzle-audit-2026-11-03.json) records the
action, initial findings, current answers, edition path, and original content hash
for every puzzle. Regression tests check all original payloads and open every
historical grid with a saved completion record.

## Validation and release status

- 90 automated tests pass, including partial progress, completion, hint-only
  progress, repeated content updates, unavailable editions, and all 228 originals.
- Full quality, clue-agreement, difficulty, and theme-relevance audits pass for
  all 228 current puzzles. CI now audits the entire current catalog.
- Production build passes. Re-running the repair tool reports 228 unchanged
  puzzles and no further repairs.
- Repository-wide lint still has pre-existing failures; changed JavaScript is
  checked against its previous diagnostics to detect newly introduced errors.
- Browser automation was unavailable in this session. A browser play-through
  remains a release check.

Changes are local. Nothing has been deployed, and no user browser storage has
been accessed or modified.

Future replacements should use `npm run regenerate:selected -- <id> [...]` or
the historical repair tool. Both publish editions rather than overwriting saved
layouts. Keep originals and every published edition in future builds.
