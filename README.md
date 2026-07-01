# Nightcrossing

## Monthly puzzle generation

The scheduled GitHub Actions workflow enriches the theme pools, generates three
new puzzles for every scheduled theme (including hidden successors), audits the
dataset, commits the result only after generation and audits succeed, and then
deploys the latest `main` build directly to the web host.
Preflight requires enough usable words for the current batch plus one complete
future batch; enrichment replenishes that rolling reserve on every run.

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

## Development

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
