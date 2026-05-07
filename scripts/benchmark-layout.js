import { performance } from 'perf_hooks';
import { generateThemedPuzzle, THEMES } from './proceduralEngine.js';
import { computePuzzleMetrics, summarizeMetrics } from './puzzleMetrics.js';

function parseArgs(argv) {
  const args = {
    runs: 4,
    themes: null,
    verbose: false
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--runs' && argv[i + 1]) {
      args.runs = Math.max(1, Number(argv[i + 1]) || args.runs);
      i++;
    } else if (token === '--themes' && argv[i + 1]) {
      args.themes = argv[i + 1]
        .split(',')
        .map(x => x.trim())
        .filter(Boolean);
      i++;
    } else if (token === '--verbose') {
      args.verbose = true;
    }
  }

  return args;
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function selectThemes(themeNames) {
  if (!themeNames || themeNames.length === 0) {
    return THEMES.slice(0, 3);
  }

  const found = THEMES.filter(theme => themeNames.includes(theme.name));
  if (found.length === 0) {
    console.error('No matching themes found.');
    process.exit(1);
  }
  return found;
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  const themes = selectThemes(args.themes);

  const durations = [];
  const allMetrics = [];

  console.log(`Benchmarking ${themes.length} theme(s), ${args.runs} run(s) each...`);

  for (const theme of themes) {
    const themeMetrics = [];
    const themeDurations = [];

    for (let run = 1; run <= args.runs; run++) {
      const id = `bench-${theme.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-r${run}`;
      const start = performance.now();

      let puzzle;
      const originalLog = console.log;
      if (!args.verbose) console.log = () => {};
      try {
        ({ puzzle } = generateThemedPuzzle(id, theme.name, theme.words));
      } finally {
        if (!args.verbose) console.log = originalLog;
      }

      const elapsed = performance.now() - start;

      if (puzzle.size.rows > 10 || puzzle.size.cols > 10) {
        console.error(`Size constraint violation in ${id}: ${puzzle.size.cols}x${puzzle.size.rows}`);
        process.exit(1);
      }

      const metrics = computePuzzleMetrics(puzzle);
      themeMetrics.push(metrics);
      themeDurations.push(elapsed);
      allMetrics.push(metrics);
      durations.push(elapsed);

      console.log(
        `  ${theme.name} run ${run}: ${puzzle.size.cols}x${puzzle.size.rows}, ` +
        `${metrics.placedWords} words, ${metrics.totalIntersections} intersections, ` +
        `${(metrics.density * 100).toFixed(1)}% density, ${elapsed.toFixed(0)}ms`
      );
    }

    const themeSummary = summarizeMetrics(themeMetrics);
    console.log(
      `  -> ${theme.name} summary: median ${median(themeDurations).toFixed(0)}ms, ` +
      `avg words ${themeSummary.avgPlacedWords.toFixed(2)}, ` +
      `avg intersections ${themeSummary.avgIntersections.toFixed(2)}, ` +
      `avg density ${(themeSummary.avgDensity * 100).toFixed(2)}%`
    );
  }

  const overall = summarizeMetrics(allMetrics);
  console.log('\nOverall summary:');
  console.log(`  Median runtime: ${median(durations).toFixed(0)}ms`);
  console.log(`  Avg words: ${overall.avgPlacedWords.toFixed(2)}`);
  console.log(`  Avg intersections: ${overall.avgIntersections.toFixed(2)}`);
  console.log(`  Avg min intersections/word: ${overall.avgMinIntersectionsPerWord.toFixed(2)}`);
  console.log(`  Avg density: ${(overall.avgDensity * 100).toFixed(2)}%`);
  console.log(`  Connected rate: ${(overall.connectedRate * 100).toFixed(2)}%`);
}

run();
