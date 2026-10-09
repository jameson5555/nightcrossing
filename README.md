# Nightcrossing

## Monthly puzzle generation

The scheduled GitHub Actions workflow enriches the theme pools, generates three
new puzzles for every scheduled theme (including hidden successors), audits the
dataset, commits the result only after generation and audits succeed, and then
deploys the latest `main` build directly to the web host.
Preflight requires enough usable words for the current batch plus one complete
future batch; enrichment replenishes that rolling reserve on every run.

The app checks the small puzzle metadata file whenever it returns to the
foreground, reconnects, and every twelve hours while visible. It downloads the
full catalog only when the metadata version changes. Android builds set
`VITE_PUZZLE_DATA_URL` to the deployed `/data/` directory, so installed apps
receive newly generated puzzle batches without requiring another APK. The
bundled dataset remains available as an offline fallback.

Catalog refreshes wait until the player returns to the menu so an open puzzle
keeps its grid and saved cells together. Cached puzzle files include the catalog
version in their URLs, keeping the list and play screen on the same data.
The list honors saved completion records as well as solved cells; an explicit
layout revision clears that puzzle's incompatible saved state.

The menu shows at most five active themes, including themes waiting for their
next batch. When a finished, exhausted theme unlocks a successor, that successor
inherits its parent's position in the list. Finished exhausted themes move to
Completed Themes; themes with in-progress puzzles remain prioritized.

Runtime controls:

- `NC_NEW_PUZZLES_PER_THEME` sets the batch size. The monthly workflow pins it
  to `3`.
- `NC_LAYOUT_ATTEMPT_SCALE` scales each layout search budget. The workflow uses
  `0.2` to keep the batch bounded.
- `NC_MAX_LAYOUT_QUALITY_RETRIES` caps independent layout retries per puzzle.
  The workflow uses `5`.
- `NC_PRIMARY_CORE_POOL_LIMIT` controls the high-relevance search window. The
  workflow uses `120` so later volumes retain enough crossing combinations.
- `NC_ENRICH_REQUEST_TIMEOUT_MS` bounds each external enrichment request. The
  workflow uses `12000` milliseconds and skips unavailable sources.

Run `npm run preflight:generation` before generation, `npm run
generate:monthly` for the full local enrichment-and-generation flow, and `npm
run test:generation-smoke` to exercise the three historically difficult themes
with the workflow search budget.

Every generated clue now requires a hint and must pass the quality gates;
the generator fails rather than publishing a candidate below those gates.
Unreviewed answers need a Zipf frequency of at least 2.5, with no more than half
the puzzle below 3.1. Frequencies are computed for all theme pools before
generation, including newly enriched words and successors. Reviewed vocabulary,
clues, and same-sense hints live in `scripts/editorialWords.js`. Dictionary
alternate meanings are no longer used as hints; imported entries receive
verifiable first-and-last-letter guidance instead. The full quality audit checks
changed puzzles; the content-safety audit checks the entire catalog.
Old unreviewed dictionary clue/hint pairs are excluded until rebuilt from a
safe spelling guidance or replaced by reviewed entries.

To replace particular grids, use `npm run regenerate:selected --
ocean---marine-life-vol15` (or pass several puzzle IDs). This uses reviewed
vocabulary, excludes answers in other volumes of the same theme, validates every
replacement before writing any, and preserves IDs, titles, wave labels, and
catalog size. Replacement layout revisions in metadata let updated clients
clear saved cells and hints for those puzzles without resetting the wallet or
progress on other puzzles. Clue-only edits do not require a layout revision.

## Development

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Monetization and Android release

Optional rewarded hints are implemented for Android and web, disabled by default.
See [launch setup and validation](docs/monetization-launch.md),
[store listing draft](docs/store-listing.md), and `.env.example`.
The game is positioned for adult crossword players, with no age screen or optional
minor-access restriction. Publisher approval, privacy setup, signing credentials,
and physical-device testing are required before monetized Play distribution.
