import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { THEMES, createThemePools, scoreWordForTheme } from './proceduralEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUZZLES_DIR = path.join(__dirname, '../public/data/puzzles');

const DEFAULT_TARGET_PUZZLES = 3;
const EXPECTED_WORDS_PER_PUZZLE = 8;
const MAX_EXTENDED_PER_PUZZLE = 2;

function parseArgs(argv) {
  const args = {
    targetPuzzles: DEFAULT_TARGET_PUZZLES,
    allowWeakThemes: false,
    json: false,
    ignoreConsumed: false
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--target' && argv[i + 1]) {
      args.targetPuzzles = Number(argv[i + 1]);
      i++;
    } else if (token === '--allow-weak-themes') {
      args.allowWeakThemes = true;
    } else if (token === '--json') {
      args.json = true;
    } else if (token === '--ignore-consumed') {
      args.ignoreConsumed = true;
    }
  }

  return args;
}

function buildConsumedByTheme(puzzlesDir) {
  const consumedByTheme = new Map();
  if (!fs.existsSync(puzzlesDir)) return consumedByTheme;

  const files = fs.readdirSync(puzzlesDir).filter(file => file.endsWith('.json'));
  for (const file of files) {
    const fullPath = path.join(puzzlesDir, file);
    try {
      const puzzle = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      const theme = puzzle?.theme;
      if (!theme) continue;

      if (!consumedByTheme.has(theme)) consumedByTheme.set(theme, new Set());
      const consumed = consumedByTheme.get(theme);

      for (const answer of puzzle?.answers?.across || []) consumed.add(String(answer).toUpperCase());
      for (const answer of puzzle?.answers?.down || []) consumed.add(String(answer).toUpperCase());
    } catch {
      // Skip malformed puzzle file.
    }
  }

  return consumedByTheme;
}

function buildLetterFrequency(words) {
  const freq = new Map();
  for (const word of words) {
    const chars = new Set((word.answer || '').toLowerCase().replace(/[^a-z]/g, ''));
    for (const ch of chars) {
      freq.set(ch, (freq.get(ch) || 0) + 1);
    }
  }
  return freq;
}

function wordCrossability(answer, letterFrequency) {
  const chars = new Set((answer || '').toLowerCase().replace(/[^a-z]/g, ''));
  if (chars.size === 0) return 0;
  let sum = 0;
  for (const ch of chars) {
    sum += Math.max(0, (letterFrequency.get(ch) || 0) - 1);
  }
  return sum / chars.size;
}

function summarizeLengths(words) {
  const dist = { short: 0, medium: 0, long: 0, extra: 0 };
  for (const word of words) {
    const len = (word.answer || '').length;
    if (len <= 4) dist.short++;
    else if (len <= 7) dist.medium++;
    else if (len <= 10) dist.long++;
    else dist.extra++;
  }
  return dist;
}

export function analyzeThemeReadiness(theme, consumedAnswers = new Set(), targetPuzzles = DEFAULT_TARGET_PUZZLES) {
  const availableWords = (theme.words || []).filter(word => !consumedAnswers.has(String(word.answer || '').toUpperCase()));
  const pools = createThemePools(theme.name, availableWords);

  const coreWords = pools.coreWords;
  const extendedWords = pools.extendedWords;
  const effectiveWords = [
    ...coreWords,
    ...extendedWords.slice(0, targetPuzzles * MAX_EXTENDED_PER_PUZZLE)
  ];

  const lengths = summarizeLengths(effectiveWords);
  const letterFrequency = buildLetterFrequency(effectiveWords);
  const avgCrossability = effectiveWords.length === 0
    ? 0
    : effectiveWords.reduce((sum, word) => sum + wordCrossability(word.answer, letterFrequency), 0) / effectiveWords.length;

  const avgCoreRelevance = coreWords.length === 0
    ? 0
    : coreWords.reduce((sum, word) => sum + scoreWordForTheme(theme.name, word), 0) / coreWords.length;

  const projectedByWords = Math.floor(effectiveWords.length / EXPECTED_WORDS_PER_PUZZLE);

  let penalties = 0;
  if (lengths.medium < targetPuzzles * 3) penalties++;
  if ((lengths.short + lengths.medium) < targetPuzzles * 5) penalties++;
  if (avgCrossability < 1.15) penalties++;

  const projectedPuzzles = Math.max(0, projectedByWords - penalties);

  const minimumCore = targetPuzzles * 6;
  const isReady =
    projectedPuzzles >= targetPuzzles &&
    coreWords.length >= minimumCore &&
    avgCoreRelevance >= 1.2;

  return {
    theme: theme.name,
    availableWords: availableWords.length,
    coreWords: coreWords.length,
    extendedWords: extendedWords.length,
    effectiveWords: effectiveWords.length,
    avgCoreRelevance: Number(avgCoreRelevance.toFixed(3)),
    avgCrossability: Number(avgCrossability.toFixed(3)),
    lengthDistribution: lengths,
    projectedPuzzles,
    targetPuzzles,
    isReady
  };
}

export function runGenerationPreflight({ targetPuzzles = DEFAULT_TARGET_PUZZLES, ignoreConsumed = false } = {}) {
  const consumedByTheme = ignoreConsumed ? new Map() : buildConsumedByTheme(PUZZLES_DIR);
  const reports = THEMES.map(theme => {
    const consumed = consumedByTheme.get(theme.name) || new Set();
    return analyzeThemeReadiness(theme, consumed, targetPuzzles);
  });

  const weakThemes = reports.filter(report => !report.isReady);
  return {
    ok: weakThemes.length === 0,
    targetPuzzles,
    reports,
    weakThemes
  };
}

function printHumanReport(result) {
  console.log(`Preflight target: ${result.targetPuzzles} puzzle(s) per theme`);
  for (const report of result.reports) {
    const badge = report.isReady ? 'OK' : 'WEAK';
    console.log(`\n[${badge}] ${report.theme}`);
    console.log(`  available/core/extended/effective: ${report.availableWords}/${report.coreWords}/${report.extendedWords}/${report.effectiveWords}`);
    console.log(`  avg core relevance: ${report.avgCoreRelevance}`);
    console.log(`  avg crossability: ${report.avgCrossability}`);
    console.log(`  lengths short/medium/long/extra: ${report.lengthDistribution.short}/${report.lengthDistribution.medium}/${report.lengthDistribution.long}/${report.lengthDistribution.extra}`);
    console.log(`  projected puzzles: ${report.projectedPuzzles}/${report.targetPuzzles}`);
  }

  if (result.weakThemes.length > 0) {
    console.log('\nWeak themes detected:');
    for (const weak of result.weakThemes) {
      console.log(`  - ${weak.theme}`);
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = runGenerationPreflight({
    targetPuzzles: args.targetPuzzles,
    ignoreConsumed: args.ignoreConsumed
  });

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHumanReport(result);
  }

  if (!result.ok && !args.allowWeakThemes) {
    process.exit(2);
  }
}

const isDirectRun = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isDirectRun) {
  main();
}
