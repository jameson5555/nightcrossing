import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isWordEntryAcceptable } from './clueQuality.js';
import { THEMES } from './proceduralEngine.js';
import { analyzeThemeReadiness } from './preflight-generation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv) {
  const args = {
    out: path.join(__dirname, '../scratch/pool-report.current.json'),
    target: 3
  };

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out' && argv[i + 1]) {
      args.out = path.resolve(argv[i + 1]);
      i++;
    } else if (argv[i] === '--target' && argv[i + 1]) {
      args.target = Number(argv[i + 1]);
      i++;
    }
  }

  return args;
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function sortEntries(map) {
  return Object.fromEntries([...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))));
}

function themeSummary(theme, targetPuzzles) {
  const sourceCounts = new Map();
  const definitionSourceCounts = new Map();
  const usableReasonCounts = new Map();
  let usableWords = 0;

  for (const word of theme.words || []) {
    increment(sourceCounts, word?.source || 'seed');
    increment(definitionSourceCounts, word?.definitionSource || 'unknown');

    const quality = isWordEntryAcceptable({
      answer: word?.answer || '',
      clue: word?.clue || '',
      hint: word?.hint || ''
    });

    if (quality.ok) {
      usableWords++;
    } else {
      increment(usableReasonCounts, quality.reason || 'unknown');
    }
  }

  const readiness = analyzeThemeReadiness(theme, new Set(), targetPuzzles);

  return {
    theme: theme.name,
    totalWords: theme.words.length,
    usableWords,
    usableRatio: Number((usableWords / Math.max(1, theme.words.length)).toFixed(4)),
    bySource: sortEntries(sourceCounts),
    byDefinitionSource: sortEntries(definitionSourceCounts),
    unusableByReason: sortEntries(usableReasonCounts),
    readiness
  };
}

function aggregateSummaries(themeSummaries) {
  const sourceCounts = new Map();
  const definitionSourceCounts = new Map();
  const unusableReasonCounts = new Map();
  let totalWords = 0;
  let usableWords = 0;

  for (const summary of themeSummaries) {
    totalWords += summary.totalWords;
    usableWords += summary.usableWords;

    for (const [key, value] of Object.entries(summary.bySource || {})) increment(sourceCounts, key, value);
    for (const [key, value] of Object.entries(summary.byDefinitionSource || {})) increment(definitionSourceCounts, key, value);
    for (const [key, value] of Object.entries(summary.unusableByReason || {})) increment(unusableReasonCounts, key, value);
  }

  return {
    totalWords,
    usableWords,
    usableRatio: Number((usableWords / Math.max(1, totalWords)).toFixed(4)),
    bySource: sortEntries(sourceCounts),
    byDefinitionSource: sortEntries(definitionSourceCounts),
    unusableByReason: sortEntries(unusableReasonCounts)
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const themeSummaries = THEMES.map(theme => themeSummary(theme, args.target));
  const aggregate = aggregateSummaries(themeSummaries);
  const weakThemes = themeSummaries
    .filter(summary => !summary.readiness?.isReady)
    .map(summary => ({
      theme: summary.theme,
      projectedPuzzles: summary.readiness?.projectedPuzzles || 0,
      avgCoreRelevance: summary.readiness?.avgCoreRelevance || 0,
      hintCoverage: summary.readiness?.hintCoverage || 0,
      weakSourceShare: summary.readiness?.weakSourceShare || 0,
      usableWords: summary.readiness?.usableWords || 0
    }));

  const output = {
    generatedAt: new Date().toISOString(),
    targetPuzzles: args.target,
    aggregate,
    weakThemes,
    themes: themeSummaries
  };

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(output, null, 2));
  console.log(`Wrote pool report to ${args.out}`);
}

main();