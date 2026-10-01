# October 2026 puzzle quality review

The [October generation and deployment job](https://github.com/jameson5555/nightcrossing/actions/runs/36794858568) succeeded and published 35 new puzzles, bringing the catalog to 198.

The green job status concealed several content problems:

- 16 of the 35 puzzles were accepted below the hint-coverage gate, with only 67–88% of clues having hints.
- All three new Ocean puzzles contained uncommon scientific or regional vocabulary. Examples include BELEMNOID, BATRACHOID, DROGHER, and PICAREL.
- Imported dictionary clues retained missing context, including “Meat cooked by this method,” “Any dish of this type,” and a definition ending in “particularly.”
- Hints were often different dictionary meanings rather than help with the displayed clue. Music 20 contained an explicit sexual hint. The profanity pattern matched the bare stem `masturbat` but missed inflected forms.
- The old clue audit enforced a small subset of the entry validator, so the job passed despite these problems. Its obscurity signal primarily recognized astronomy and mythology, rather than answer frequency.
- Sports, Animals, and History ended their batches early after five constrained-layout failures. Sports switched to its existing Nature successor; Animals and History were replaced by Clothing and Theater. This was allowed by the existing rotation policy despite large raw pools. Those rotation decisions are retained.

## Repairs

All 35 October puzzles were reviewed. Twenty-one received new grids; fourteen retained their grids and answers with rewritten clues and hints. Ocean & Marine Life 15 was also regenerated. Three older puzzles with inappropriate material were repaired: Animals 9, Food 12, and Music 14. In total, 25 grids were regenerated and 14 puzzles were reclued.

Ocean 15 now uses ORCA, COASTAL, SAILOR, SCALES, CRAB, GILL, STRAIT, and SHOAL. Its average corpus frequency rose from 0.03 to 3.64 Zipf; its difficulty label changed from Hard to Normal. Frequency is a proxy for familiarity, not a guarantee about any individual solver.

The catalog remains at 198 with the same IDs, titles, themes, and wave labels. The global progress reset version is unchanged. Each replacement has a layout revision; updated clients clear only those puzzles' obsolete cells, clue hints, revealed positions, and completion flags. The hint wallet and progress for other puzzles are preserved. Existing Android binaries need an app update to gain this targeted revision handling.

## Prevention

- Require a nonempty hint for every answer, including short answers.
- Reject dangling dictionary references, truncated examples, taxonomic definitions, and alternate-spelling clues.
- Reject unreviewed answers below 2.5 Zipf and limit unreviewed rare answers to half a puzzle. Annotate all pools before generation, including successors and new imports.
- Use reviewed themed vocabulary and same-sense hints in `scripts/editorialWords.js`. Explicitly reviewed compounds may be absent from the corpus.
- Quarantine old unreviewed dictionary clue/hint pairs. New dictionary imports receive verifiable first-and-last-letter guidance rather than a second dictionary meaning.
- Apply lexical and aggregate crossing checks to every fallback search. Fail generation when no candidate passes the quality gates.
- Run the complete entry/grid quality audit on changed puzzles; run content safety and the existing clue-agreement checks across all 198 puzzles.
- Support targeted replacement with `npm run regenerate:selected -- <id> [...]`. It validates all selected replacements before writing and excludes answers used by other volumes of the same theme.
- Align local preflight and generation defaults with the workflow's rolling reserve of one complete future batch.

Untouched historical puzzles retain their existing editorial content. They have received the catalog-wide content and clue-agreement checks, not the stricter review applied to this batch.

## Validation

- 61 automated tests passed, including regressions for the actual October failures and targeted progress invalidation.
- Difficulty and clue/content audits passed for all 198 puzzles.
- Theme relevance and complete quality audits passed for all 39 changed puzzles, covering 304 answers.
- Generation preflight passed for all ten scheduled themes and all three unassigned candidate themes with the configured future reserve.
- Nine future puzzles generated successfully under the monthly workflow search budget: three each for Food, Music, and Ocean. All passed content, hint, connectivity, and crossing checks.
- All 848 reviewed source entries passed the entry validator.
- Catalog IDs, puzzle count, preserved layouts, replacement hashes, and the unchanged global reset version were verified.
- Production build passed. ESLint passed for the newly added modules and tests; repository-wide lint still reports pre-existing errors, chiefly Node globals and unused variables.

These changes are local and have not been pushed or deployed.
