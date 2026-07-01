import fs from 'fs';
import path from 'path';
import process from 'node:process';
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';
import { THEMES, createThemePools, scoreWordForTheme } from './proceduralEngine.js';
import { isWordEntryAcceptable } from './clueQuality.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const {
  loadRotation,
  getGenerationThemeNames,
  normalizedThemeKey: normalizedRotationThemeKey
} = require('./themeRotation.cjs');
const PUZZLES_DIR = path.join(__dirname, '../public/data/puzzles');

const DEFAULT_TARGET_PUZZLES = 3;
const DEFAULT_MIN_FUTURE_RUNWAY_BATCHES = Number.isFinite(Number(process.env.NC_MIN_FUTURE_RUNWAY_BATCHES))
  ? Math.max(0, Math.min(12, Number(process.env.NC_MIN_FUTURE_RUNWAY_BATCHES)))
  : 2;
const DEFAULT_CANDIDATE_MIN_FUTURE_RUNWAY_BATCHES = Number.isFinite(Number(process.env.NC_CANDIDATE_MIN_FUTURE_RUNWAY_BATCHES))
  ? Math.max(0, Math.min(12, Number(process.env.NC_CANDIDATE_MIN_FUTURE_RUNWAY_BATCHES)))
  : 1;
const EXPECTED_WORDS_PER_PUZZLE = 8;
const MAX_EXTENDED_PER_PUZZLE = 2;
const MAX_LONG_WORD_SHARE = 0.35;
const MIN_HINT_COVERAGE = 0.5;
const MAX_INVALID_ENTRY_SHARE = 0.2;
const MAX_WEAK_SOURCE_SHARE = 0.08;
const WEAK_SOURCES = new Set(['rel_jjb', 'rel_jja', 'rel_spc', 'rel_trg']);
const STABLE_SOURCES = new Set(['seed', 'wikidata-search', 'wikipedia-category', 'wikipedia-subcategory', 'wordnet-synonym']);

function normalizedThemeKey(themeName) {
  return normalizedRotationThemeKey(themeName);
}

const THEME_FILTER_KEYS = new Set(
  String(process.env.NC_THEME_FILTER || '')
    .split(',')
    .map(themeName => normalizedThemeKey(themeName))
    .filter(Boolean)
);

function parseArgs(argv) {
  const args = {
    targetPuzzles: DEFAULT_TARGET_PUZZLES,
    minFutureRunwayBatches: DEFAULT_MIN_FUTURE_RUNWAY_BATCHES,
    allowWeakThemes: false,
    json: false,
    ignoreConsumed: false
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--target' && argv[i + 1]) {
      args.targetPuzzles = Number(argv[i + 1]);
      i++;
    } else if (token === '--min-future-runway' && argv[i + 1]) {
      args.minFutureRunwayBatches = Math.max(0, Number(argv[i + 1]));
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

function hasUsableHint(word) {
  return Boolean(String(word?.hint || '').trim());
}

function sourceKey(word) {
  return word?.source || 'seed';
}

function isUsableEntry(word) {
  return isWordEntryAcceptable({
    answer: word?.answer || '',
    clue: word?.clue || '',
    hint: word?.hint || ''
  }).ok;
}

function buildReadinessFailures({
  projectedPuzzles,
  targetPuzzles,
  futureRunwayBatches,
  minFutureRunwayBatches,
  usableCoreWords,
  minimumCore
}) {
  const failures = [];

  if (projectedPuzzles < targetPuzzles) {
    failures.push(`projected ${projectedPuzzles}/${targetPuzzles} puzzle(s)`);
  }
  if (futureRunwayBatches < minFutureRunwayBatches) {
    failures.push(`future runway ${futureRunwayBatches}/${minFutureRunwayBatches} batch(es)`);
  }
  if (usableCoreWords < minimumCore) {
    failures.push(`usable core ${usableCoreWords}/${minimumCore}`);
  }

  return failures;
}

function buildReadinessAdvisories({
  avgCoreRelevance,
  avgCrossability,
  longShare,
  hintCoverage,
  invalidShare,
  weakSourceShare
}) {
  const advisories = [];

  if (hintCoverage < MIN_HINT_COVERAGE) {
    advisories.push(`hint coverage ${hintCoverage.toFixed(3)} < ${MIN_HINT_COVERAGE}`);
  }
  if (invalidShare > MAX_INVALID_ENTRY_SHARE) {
    advisories.push(`invalid share ${invalidShare.toFixed(3)} > ${MAX_INVALID_ENTRY_SHARE}`);
  }
  if (weakSourceShare > MAX_WEAK_SOURCE_SHARE) {
    advisories.push(`weak source share ${weakSourceShare.toFixed(3)} > ${MAX_WEAK_SOURCE_SHARE}`);
  }
  if (avgCrossability < 1.22) {
    advisories.push(`crossability ${avgCrossability.toFixed(2)} < 1.22`);
  }
  if (longShare > MAX_LONG_WORD_SHARE) {
    advisories.push(`long-word share ${longShare.toFixed(2)} > ${MAX_LONG_WORD_SHARE}`);
  }
  if (avgCoreRelevance < 1.2) {
    advisories.push(`avg relevance ${avgCoreRelevance.toFixed(2)} < 1.20`);
  }

  return advisories;
}

export function analyzeThemeReadiness(
  theme,
  consumedAnswers = new Set(),
  targetPuzzles = DEFAULT_TARGET_PUZZLES,
  { minFutureRunwayBatches = DEFAULT_MIN_FUTURE_RUNWAY_BATCHES } = {}
) {
  const availableWords = (theme.words || []).filter(word => !consumedAnswers.has(String(word.answer || '').toUpperCase()));
  const pools = createThemePools(theme.name, availableWords);

  const coreWords = pools.coreWords;
  const extendedWords = pools.extendedWords;
  const effectiveWords = [
    ...coreWords,
    ...extendedWords.slice(0, targetPuzzles * MAX_EXTENDED_PER_PUZZLE)
  ];

  const usableCoreWords = coreWords.filter(isUsableEntry);
  const usableWords = effectiveWords.filter(isUsableEntry);
  const invalidShare = effectiveWords.length > 0
    ? (effectiveWords.length - usableWords.length) / effectiveWords.length
    : 0;

  const lengths = summarizeLengths(usableWords);
  const longShare = usableWords.length > 0
    ? (lengths.long + lengths.extra) / usableWords.length
    : 0;
  const letterFrequency = buildLetterFrequency(usableWords);
  const avgCrossability = usableWords.length === 0
    ? 0
    : usableWords.reduce((sum, word) => sum + wordCrossability(word.answer, letterFrequency), 0) / usableWords.length;

  const avgCoreRelevance = usableCoreWords.length === 0
    ? 0
    : usableCoreWords.reduce((sum, word) => sum + scoreWordForTheme(theme.name, word), 0) / usableCoreWords.length;

  const hintCoverage = usableWords.length === 0
    ? 0
    : usableWords.filter(hasUsableHint).length / usableWords.length;
  const weakSourceShare = usableWords.length === 0
    ? 0
    : usableWords.filter(word => WEAK_SOURCES.has(sourceKey(word))).length / usableWords.length;
  const stableSourceShare = usableWords.length === 0
    ? 0
    : usableWords.filter(word => STABLE_SOURCES.has(sourceKey(word))).length / usableWords.length;
  const uniqueSources = new Set(usableWords.map(sourceKey));

  const projectedByWords = Math.floor(usableWords.length / EXPECTED_WORDS_PER_PUZZLE);
  const reservePuzzles = Math.max(0, projectedByWords - targetPuzzles);

  let penalties = 0;
  if (lengths.medium < targetPuzzles * 3) penalties++;
  if ((lengths.short + lengths.medium) < targetPuzzles * 5) penalties++;
  if (avgCrossability < 1.22) penalties++;
  if (longShare > MAX_LONG_WORD_SHARE) penalties++;
  if (hintCoverage < MIN_HINT_COVERAGE) penalties++;
  if (invalidShare > MAX_INVALID_ENTRY_SHARE) penalties++;
  if (weakSourceShare > MAX_WEAK_SOURCE_SHARE) penalties++;

  const projectedPuzzles = Math.max(0, projectedByWords - penalties);
  const projectedRunwayBatches = targetPuzzles > 0 ? Math.floor(projectedPuzzles / targetPuzzles) : 0;
  const futureRunwayBatches = Math.max(0, projectedRunwayBatches - 1);

  const minimumCore = targetPuzzles * 6;
  const readinessFailures = buildReadinessFailures({
    projectedPuzzles,
    targetPuzzles,
    futureRunwayBatches,
    minFutureRunwayBatches,
    usableCoreWords: usableCoreWords.length,
    minimumCore
  });
  const readinessAdvisories = buildReadinessAdvisories({
    avgCoreRelevance,
    avgCrossability,
    longShare,
    hintCoverage,
    invalidShare,
    weakSourceShare
  });
  const isReady = readinessFailures.length === 0;

  return {
    theme: theme.name,
    availableWords: availableWords.length,
    coreWords: coreWords.length,
    usableCoreWords: usableCoreWords.length,
    extendedWords: extendedWords.length,
    effectiveWords: effectiveWords.length,
    usableWords: usableWords.length,
    avgCoreRelevance: Number(avgCoreRelevance.toFixed(3)),
    avgCrossability: Number(avgCrossability.toFixed(3)),
    hintCoverage: Number(hintCoverage.toFixed(3)),
    invalidShare: Number(invalidShare.toFixed(3)),
    weakSourceShare: Number(weakSourceShare.toFixed(3)),
    stableSourceShare: Number(stableSourceShare.toFixed(3)),
    sourceDiversity: uniqueSources.size,
    lengthDistribution: lengths,
    projectedPuzzles,
    projectedRunwayBatches,
    futureRunwayBatches,
    minFutureRunwayBatches,
    reservePuzzles,
    targetPuzzles,
    readinessFailures,
    readinessAdvisories,
    isReady
  };
}

export function runGenerationPreflight({
  targetPuzzles = DEFAULT_TARGET_PUZZLES,
  ignoreConsumed = false,
  minFutureRunwayBatches = DEFAULT_MIN_FUTURE_RUNWAY_BATCHES,
  candidateMinFutureRunwayBatches = DEFAULT_CANDIDATE_MIN_FUTURE_RUNWAY_BATCHES
} = {}) {
  const consumedByTheme = ignoreConsumed ? new Map() : buildConsumedByTheme(PUZZLES_DIR);
  const rotation = loadRotation();
  const generationThemeKeys = new Set(getGenerationThemeNames(rotation).map(normalizedThemeKey));
  const activeThemes = THEMES.filter(theme => {
    if (THEME_FILTER_KEYS.size === 0) {
      return generationThemeKeys.size === 0 || generationThemeKeys.has(normalizedThemeKey(theme.name));
    }
    return THEME_FILTER_KEYS.has(normalizedThemeKey(theme.name));
  });
  const reports = activeThemes.map(theme => {
    const consumed = consumedByTheme.get(theme.name) || new Set();
    return analyzeThemeReadiness(theme, consumed, targetPuzzles, { minFutureRunwayBatches });
  });

  const weakThemes = reports.filter(report => !report.isReady);
  const assignedNextThemeKeys = new Set(
    rotation.slots
      .map(slot => normalizedThemeKey(slot?.nextTheme))
      .filter(Boolean)
  );
  const activeThemeKeys = new Set(
    rotation.slots
      .flatMap(slot => [slot?.currentTheme, slot?.nextTheme])
      .map(normalizedThemeKey)
      .filter(Boolean)
  );
  const candidateReports = (rotation.candidates || [])
    .filter(themeName => !assignedNextThemeKeys.has(normalizedThemeKey(themeName)))
    .filter(themeName => !activeThemeKeys.has(normalizedThemeKey(themeName)))
    .map(themeName => THEMES.find(theme => normalizedThemeKey(theme.name) === normalizedThemeKey(themeName)))
    .filter(Boolean)
    .map(theme => {
      const consumed = consumedByTheme.get(theme.name) || new Set();
      return analyzeThemeReadiness(theme, consumed, targetPuzzles, {
        minFutureRunwayBatches: candidateMinFutureRunwayBatches
      });
    });
  const readyCandidateReports = candidateReports.filter(report => report.isReady);
  const blockedReplacementCount = Math.max(0, weakThemes.length - readyCandidateReports.length);

  return {
    ok: blockedReplacementCount === 0,
    targetPuzzles,
    minFutureRunwayBatches,
    candidateMinFutureRunwayBatches,
    reports,
    weakThemes,
    candidateReports,
    readyCandidateReports,
    blockedReplacementCount
  };
}

function printHumanReport(result) {
  console.log(`Preflight target: ${result.targetPuzzles} puzzle(s) per theme`);
  console.log(`Minimum future runway after this run: ${result.minFutureRunwayBatches} batch(es)`);
  for (const report of result.reports) {
    const badge = report.isReady ? 'OK' : 'WEAK';
    console.log(`\n[${badge}] ${report.theme}`);
    console.log(`  available/core/usable-core/extended/effective/usable: ${report.availableWords}/${report.coreWords}/${report.usableCoreWords}/${report.extendedWords}/${report.effectiveWords}/${report.usableWords}`);
    console.log(`  avg core relevance: ${report.avgCoreRelevance}`);
    console.log(`  avg crossability: ${report.avgCrossability}`);
    console.log(`  hint coverage: ${report.hintCoverage}`);
    console.log(`  invalid share: ${report.invalidShare}`);
    console.log(`  weak/stable source share: ${report.weakSourceShare}/${report.stableSourceShare} (sources ${report.sourceDiversity})`);
    console.log(`  lengths short/medium/long/extra: ${report.lengthDistribution.short}/${report.lengthDistribution.medium}/${report.lengthDistribution.long}/${report.lengthDistribution.extra}`);
    console.log(`  projected puzzles: ${report.projectedPuzzles}/${report.targetPuzzles} (reserve ${report.reservePuzzles})`);
    console.log(`  runway batches total/future: ${report.projectedRunwayBatches}/${report.futureRunwayBatches}`);
    if (report.readinessFailures.length > 0) {
      console.log(`  failures: ${report.readinessFailures.join('; ')}`);
    }
    if (report.readinessAdvisories.length > 0) {
      console.log(`  advisories: ${report.readinessAdvisories.join('; ')}`);
    }
  }

  if (result.weakThemes.length > 0) {
    console.log('\nThemes needing replacement runway:');
    for (const weak of result.weakThemes) {
      console.log(`  - ${weak.theme}: ${weak.readinessFailures.join('; ')}`);
    }
  }
  if (result.candidateReports?.length > 0) {
    console.log(`\nCandidate replacements (minimum future runway ${result.candidateMinFutureRunwayBatches} batch(es)):`);
    for (const report of result.candidateReports) {
      const badge = report.isReady ? 'READY' : 'BLOCKED';
      console.log(`  [${badge}] ${report.theme}: projected ${report.projectedPuzzles}, future runway ${report.futureRunwayBatches}`);
      if (report.readinessFailures.length > 0) {
        console.log(`    reasons: ${report.readinessFailures.join('; ')}`);
      }
    }
  }
  if (result.blockedReplacementCount > 0) {
    console.log(`\nReplacement shortage: ${result.blockedReplacementCount} exhausted theme slot(s) lack a ready candidate.`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = runGenerationPreflight({
    targetPuzzles: args.targetPuzzles,
    ignoreConsumed: args.ignoreConsumed,
    minFutureRunwayBatches: args.minFutureRunwayBatches
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
