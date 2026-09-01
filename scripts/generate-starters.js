import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { generateThemedPuzzle, THEMES, scoreWordForTheme } from './proceduralEngine.js';
import { analyzeThemeReadiness, runGenerationPreflight } from './preflight-generation.js';
import { fetchThemeWords } from './fetch-theme-words.js';
import {
  assertSuccessfulThemeBatch,
  decideThemeBatchOutcome,
  dedupeWordsByClue,
  isExhaustibleGenerationFailure
} from './generationPolicy.js';
import { computePuzzleMetrics } from './puzzleMetrics.js';
import { computeLexicalStatsForAnswers } from './lexicalDifficulty.js';
import difficultyRubricPkg from './difficultyRubric.cjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const {
  loadRotation,
  saveRotation,
  findThemeByName,
  getGenerationThemeNames,
  markThemeExhausted,
  replaceScheduledTheme,
  assignNextTheme,
  normalizedThemeKey: normalizedRotationThemeKey
} = require('./themeRotation.cjs');
const DATA_DIR = path.join(__dirname, '../public/data');
const PUZZLES_DIR = path.join(DATA_DIR, 'puzzles');
const INDEX_FILE = path.join(DATA_DIR, 'puzzles.json');
const PUZZLES_PER_SET = 3;
const EASY_LONG_WORD_LENGTH = 7;
const { DIFFICULTY_RUBRIC, classifyDifficulty, meetsEasyRubric } = difficultyRubricPkg;

function normalizedThemeKey(themeName) {
  return normalizedRotationThemeKey(themeName);
}

function slugifyThemeName(themeName) {
  return String(themeName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-');
}

function buildPuzzleId(themeName, volume, legacyPrefix = false) {
  const prefix = legacyPrefix ? 'starter-' : '';
  return `${prefix}${slugifyThemeName(themeName)}-vol${volume}`;
}

function parseVolumeFromId(id) {
  const match = String(id || '').match(/-vol(\d+)$/);
  return match ? Number(match[1]) : null;
}

function formatWaveLabel(volume) {
  const safeVolume = Number(volume);
  if (!Number.isFinite(safeVolume) || safeVolume < 1) return '';
  const waveNumber = Math.floor((safeVolume - 1) / PUZZLES_PER_SET) + 1;
  return `Wave ${waveNumber}`;
}

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PUZZLES_DIR)) fs.mkdirSync(PUZZLES_DIR, { recursive: true });

const REGENERATE = process.argv.includes('--regenerate');
const ALLOW_WEAK_THEMES = process.argv.includes('--allow-weak-themes');
const SKIP_PREFLIGHT = process.argv.includes('--skip-preflight');
const SKIP_ENRICHMENT = process.argv.includes('--skip-enrichment');
const ALLOW_REPEAT_ANSWERS = process.argv.includes('--allow-repeat-answers');
const NEW_PUZZLES_PER_THEME = Number.isFinite(Number(process.env.NC_NEW_PUZZLES_PER_THEME))
  ? Math.max(1, Math.min(12, Number(process.env.NC_NEW_PUZZLES_PER_THEME)))
  : 3;
const THEME_FILTER_KEYS = new Set(
  String(process.env.NC_THEME_FILTER || '')
    .split(',')
    .map(themeName => normalizedThemeKey(themeName))
    .filter(Boolean)
);
const MAX_LAYOUT_QUALITY_RETRIES = Number.isFinite(Number(process.env.NC_MAX_LAYOUT_QUALITY_RETRIES))
  ? Math.max(1, Math.min(10, Number(process.env.NC_MAX_LAYOUT_QUALITY_RETRIES)))
  : 5;
const THEME_EXHAUSTION_FAILURE_THRESHOLD = Number.isFinite(Number(process.env.NC_THEME_EXHAUSTION_FAILURE_THRESHOLD))
  ? Math.max(2, Math.min(50, Number(process.env.NC_THEME_EXHAUSTION_FAILURE_THRESHOLD)))
  : MAX_LAYOUT_QUALITY_RETRIES;
const MIN_LONG_TWO_PLUS_RATE = Number.isFinite(Number(process.env.NC_MIN_LONG_TWO_PLUS_RATE))
  ? Math.max(0, Math.min(1, Number(process.env.NC_MIN_LONG_TWO_PLUS_RATE)))
  : 0.82;
const MIN_VERY_LONG_THREE_PLUS_RATE = Number.isFinite(Number(process.env.NC_MIN_VERY_LONG_THREE_PLUS_RATE))
  ? Math.max(0, Math.min(1, Number(process.env.NC_MIN_VERY_LONG_THREE_PLUS_RATE)))
  : 0.62;
const MIN_HINT_COVERAGE = Number.isFinite(Number(process.env.NC_MIN_HINT_COVERAGE))
  ? Math.max(0, Math.min(1, Number(process.env.NC_MIN_HINT_COVERAGE)))
  : 0.97;
const MAX_LEXICAL_OBSCURE_SIGNAL_LOAD = Number.isFinite(Number(process.env.NC_MAX_LEXICAL_OBSCURE_SIGNAL_LOAD))
  ? Math.max(0, Math.min(1, Number(process.env.NC_MAX_LEXICAL_OBSCURE_SIGNAL_LOAD)))
  : 0.24;
const EASY_TOP_OFF_ENABLED = process.env.NC_ENABLE_EASY_TOP_OFF !== '0';
const EASY_TOP_OFF_ATTEMPTS_PER_SLOT = Number.isFinite(Number(process.env.NC_EASY_TOP_OFF_ATTEMPTS_PER_SLOT))
  ? Math.max(1, Math.min(12, Number(process.env.NC_EASY_TOP_OFF_ATTEMPTS_PER_SLOT)))
  : 6;
const EASY_TOP_OFF_ATTEMPT_MULTIPLIER = Number.isFinite(Number(process.env.NC_EASY_TOP_OFF_ATTEMPT_MULTIPLIER))
  ? Math.max(1, Math.min(4, Number(process.env.NC_EASY_TOP_OFF_ATTEMPT_MULTIPLIER)))
  : 1.8;
const EASY_TOP_OFF_MAX_REPLACEMENTS = Number.isFinite(Number(process.env.NC_EASY_TOP_OFF_MAX_REPLACEMENTS))
  ? Math.max(0, Math.min(12, Number(process.env.NC_EASY_TOP_OFF_MAX_REPLACEMENTS)))
  : 6;
const EASY_TOP_OFF_MAX_CANDIDATES = Number.isFinite(Number(process.env.NC_EASY_TOP_OFF_MAX_CANDIDATES))
  ? Math.max(0, Math.min(24, Number(process.env.NC_EASY_TOP_OFF_MAX_CANDIDATES)))
  : Math.max(3, EASY_TOP_OFF_MAX_REPLACEMENTS * 2);
const EASY_TOP_OFF_MAX_BATCH_SIZE = Number.isFinite(Number(process.env.NC_EASY_TOP_OFF_MAX_BATCH_SIZE))
  ? Math.max(0, Math.min(48, Number(process.env.NC_EASY_TOP_OFF_MAX_BATCH_SIZE)))
  : 12;
const EASY_TOP_OFF_FOCUSED_POOL_MIN = Number.isFinite(Number(process.env.NC_EASY_TOP_OFF_FOCUSED_POOL_MIN))
  ? Math.max(10, Math.min(80, Number(process.env.NC_EASY_TOP_OFF_FOCUSED_POOL_MIN)))
  : 18;
const MIN_FUTURE_RUNWAY_BATCHES = Number.isFinite(Number(process.env.NC_MIN_FUTURE_RUNWAY_BATCHES))
  ? Math.max(0, Math.min(12, Number(process.env.NC_MIN_FUTURE_RUNWAY_BATCHES)))
  : 2;
const CANDIDATE_MIN_FUTURE_RUNWAY_BATCHES = Number.isFinite(Number(process.env.NC_CANDIDATE_MIN_FUTURE_RUNWAY_BATCHES))
  ? Math.max(0, Math.min(12, Number(process.env.NC_CANDIDATE_MIN_FUTURE_RUNWAY_BATCHES)))
  : 1;
function getActiveThemesForGeneration(rotation = loadRotation()) {
  const generationThemeKeys = new Set(getGenerationThemeNames(rotation).map(normalizedThemeKey));
  return THEMES.filter(theme => {
    if (THEME_FILTER_KEYS.size === 0) {
      return generationThemeKeys.size === 0 || generationThemeKeys.has(normalizedThemeKey(theme.name));
    }
    return THEME_FILTER_KEYS.has(normalizedThemeKey(theme.name));
  });
}

const LEXICAL_OBSCURE_SIGNAL_REGEX = /\b(goddess|god|deity|mythological|myth|constellation|kuiper|trojan|tau\s+[a-z]+|mistress\s+of\s+zeus|one\s+of\s+the\s+moons?\s+of\s+(jupiter|saturn|uranus)|aoede|elara|amalthea|hygiea|pegasi|capricorni|ursa\s+major)\b/i;
const PROPER_NOUN_HINT_REGEX = /\b(god|goddess|deity|constellation|myth|mythological|roman|greek)\b/i;
const COMMON_CAPITALIZED_THEME_WORDS = new Set(['earth', 'sun', 'moon']);
const CLUE_OBSCURITY_REGEX = /[;:()]|\b(archaic|obsolete|mythological|technical|primordial|kuiper|trojan|alpha\s+[a-z]+|beta\s+[a-z]+)\b/i;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function safeRatio(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return numerator / denominator;
}

function addPuzzleAnswersToSet(puzzleData, targetSet) {
  if (!puzzleData?.answers) return;
  for (const answer of puzzleData.answers.across || []) {
    targetSet.add(String(answer).toUpperCase());
  }
  for (const answer of puzzleData.answers.down || []) {
    targetSet.add(String(answer).toUpperCase());
  }
}

function computeHintCoverage(puzzle) {
  const clueCount = (puzzle?.answers?.across?.length || 0) + (puzzle?.answers?.down?.length || 0);
  const hintCount = Object.keys(puzzle?.hints || {}).length;
  if (clueCount <= 0) {
    return { clueCount, hintCount, coverage: 1 };
  }
  return {
    clueCount,
    hintCount,
    coverage: hintCount / clueCount
  };
}

function computeLexicalObscureSignalLoad(puzzle) {
  const acrossClues = Array.isArray(puzzle?.clues?.across) ? puzzle.clues.across : [];
  const downClues = Array.isArray(puzzle?.clues?.down) ? puzzle.clues.down : [];
  const hints = puzzle?.hints && typeof puzzle.hints === 'object' ? Object.values(puzzle.hints) : [];

  const texts = [...acrossClues, ...downClues, ...hints]
    .map(text => String(text || '').replace(/^\d+\.\s*/, '').trim())
    .filter(Boolean);

  if (texts.length === 0) {
    return { load: 0, hits: 0, total: 0 };
  }

  let hits = 0;
  for (const text of texts) {
    if (LEXICAL_OBSCURE_SIGNAL_REGEX.test(text)) hits++;
  }

  return {
    load: hits / texts.length,
    hits,
    total: texts.length
  };
}

function stripCluePrefix(entry) {
  return String(entry || '').replace(/^\d+\.\s*/, '').trim();
}

function collectAnswerTexts(puzzle) {
  const acrossAnswers = Array.isArray(puzzle?.answers?.across) ? puzzle.answers.across : [];
  const downAnswers = Array.isArray(puzzle?.answers?.down) ? puzzle.answers.down : [];
  return [...acrossAnswers, ...downAnswers]
    .map(answer => String(answer || '').trim())
    .filter(Boolean);
}

function hasInnerCapitalizedToken(text) {
  const value = String(text || '').trim();
  if (!value) return false;

  let firstWordSkipped = false;
  const matches = value.match(/\b[A-Z][a-z]{2,}\b/g) || [];
  for (const token of matches) {
    if (!firstWordSkipped) {
      firstWordSkipped = true;
      continue;
    }
    if (COMMON_CAPITALIZED_THEME_WORDS.has(token.toLowerCase())) {
      continue;
    }
    return true;
  }

  return false;
}

function collectEasyTextLoads(puzzle) {
  const clueTexts = [
    ...(Array.isArray(puzzle?.clues?.across) ? puzzle.clues.across : []),
    ...(Array.isArray(puzzle?.clues?.down) ? puzzle.clues.down : [])
  ].map(stripCluePrefix).filter(Boolean);
  const hintTexts = Object.values(puzzle?.hints || {}).map(value => String(value || '').trim()).filter(Boolean);
  const totalTextItems = clueTexts.length + hintTexts.length;

  let properNounHits = 0;
  let obscureTextHits = 0;

  for (const text of [...clueTexts, ...hintTexts]) {
    if (PROPER_NOUN_HINT_REGEX.test(text) || hasInnerCapitalizedToken(text)) {
      properNounHits += 1;
    }
    if (CLUE_OBSCURITY_REGEX.test(text)) {
      obscureTextHits += 1;
    }
  }

  return {
    properNounLoad: clamp(safeRatio(properNounHits, totalTextItems) / 0.55, 0, 1),
    clueObscurityLoad: clamp(safeRatio(obscureTextHits, totalTextItems) / 0.55, 0, 1)
  };
}

async function buildDifficultyProfile(puzzle) {
  const answers = collectAnswerTexts(puzzle);
  const metrics = computePuzzleMetrics(puzzle);
  const lexicalStats = await computeLexicalStatsForAnswers(answers);
  const avgWordLength = answers.reduce((sum, word) => sum + String(word).length, 0) / Math.max(1, answers.length);
  const easyLongWordCount = answers.filter(word => String(word).length >= EASY_LONG_WORD_LENGTH).length;
  const textLoads = collectEasyTextLoads(puzzle);

  return {
    placedWords: metrics.placedWords,
    avgWordLength,
    easyLongWordCount,
    longWordCount: metrics.longWordCount,
    veryLongWordCount: metrics.veryLongWordCount,
    avgIntersectionsPerWord: metrics.avgIntersectionsPerWord,
    properNounLoad: textLoads.properNounLoad,
    clueObscurityLoad: textLoads.clueObscurityLoad,
    lexicalDifficultyLoad: lexicalStats.lexicalDifficultyLoad,
    avgZipfFrequency: lexicalStats.avgZipfFrequency,
    rareAnswerShare: lexicalStats.rareAnswerShare,
    difficultAnswerShare: lexicalStats.difficultAnswerShare
  };
}

function collectEasyFailures(profile) {
  const failures = [];
  if (profile.placedWords > DIFFICULTY_RUBRIC.easy.maxPlacedWords) failures.push(`placed>${DIFFICULTY_RUBRIC.easy.maxPlacedWords}`);
  if (profile.avgWordLength > DIFFICULTY_RUBRIC.easy.maxAvgWordLength) failures.push(`avgLen>${DIFFICULTY_RUBRIC.easy.maxAvgWordLength}`);
  if (profile.easyLongWordCount > DIFFICULTY_RUBRIC.easy.maxEasyLongWordCount) failures.push(`long7>${DIFFICULTY_RUBRIC.easy.maxEasyLongWordCount}`);
  if (profile.longWordCount > DIFFICULTY_RUBRIC.easy.maxLongWordCount) failures.push(`long8>${DIFFICULTY_RUBRIC.easy.maxLongWordCount}`);
  if (profile.veryLongWordCount > DIFFICULTY_RUBRIC.easy.maxVeryLongWordCount) failures.push(`long10>${DIFFICULTY_RUBRIC.easy.maxVeryLongWordCount}`);
  if (profile.avgIntersectionsPerWord < DIFFICULTY_RUBRIC.easy.minAvgIntersectionsPerWord) failures.push(`intersections<${DIFFICULTY_RUBRIC.easy.minAvgIntersectionsPerWord}`);
  if (profile.properNounLoad > DIFFICULTY_RUBRIC.easy.maxProperNounLoad) failures.push(`proper>${DIFFICULTY_RUBRIC.easy.maxProperNounLoad}`);
  if (profile.clueObscurityLoad > DIFFICULTY_RUBRIC.easy.maxClueObscurityLoad) failures.push(`obscure>${DIFFICULTY_RUBRIC.easy.maxClueObscurityLoad}`);
  if (profile.lexicalDifficultyLoad > DIFFICULTY_RUBRIC.easy.maxLexicalDifficultyLoad) failures.push(`lexical>${DIFFICULTY_RUBRIC.easy.maxLexicalDifficultyLoad}`);
  return failures;
}

function scoreEasyMismatch(profile) {
  return (
    Math.max(0, profile.placedWords - DIFFICULTY_RUBRIC.easy.maxPlacedWords) * 2.5 +
    Math.max(0, profile.avgWordLength - DIFFICULTY_RUBRIC.easy.maxAvgWordLength) * 4 +
    Math.max(0, profile.easyLongWordCount - DIFFICULTY_RUBRIC.easy.maxEasyLongWordCount) * 2.75 +
    Math.max(0, profile.longWordCount - DIFFICULTY_RUBRIC.easy.maxLongWordCount) * 3 +
    Math.max(0, profile.veryLongWordCount - DIFFICULTY_RUBRIC.easy.maxVeryLongWordCount) * 4 +
    Math.max(0, DIFFICULTY_RUBRIC.easy.minAvgIntersectionsPerWord - profile.avgIntersectionsPerWord) * 4 +
    Math.max(0, profile.properNounLoad - DIFFICULTY_RUBRIC.easy.maxProperNounLoad) * 2 +
    Math.max(0, profile.clueObscurityLoad - DIFFICULTY_RUBRIC.easy.maxClueObscurityLoad) * 2 +
    Math.max(0, profile.lexicalDifficultyLoad - DIFFICULTY_RUBRIC.easy.maxLexicalDifficultyLoad) * 3
  );
}

function getThemePuzzleFiles(themeName) {
  const themeSlug = slugifyThemeName(themeName);
  const themePrefix = `${themeSlug}-vol`;
  const legacyThemePrefix = `starter-${themeSlug}-vol`;
  return fs.readdirSync(PUZZLES_DIR)
    .filter(f => f.startsWith(themePrefix) || f.startsWith(legacyThemePrefix));
}

function buildThemeConsumedWords(themeName, historicalConsumedByTheme, excludedIds = new Set()) {
  const consumedWords = new Set();

  if (!ALLOW_REPEAT_ANSWERS) {
    const historical = historicalConsumedByTheme.get(themeName);
    if (historical) {
      for (const answer of historical) consumedWords.add(answer);
    }
  }

  for (const fileName of getThemePuzzleFiles(themeName)) {
    const fileId = fileName.replace(/\.json$/, '');
    if (excludedIds.has(fileId)) continue;
    try {
      const puzzle = JSON.parse(fs.readFileSync(path.join(PUZZLES_DIR, fileName), 'utf8'));
      addPuzzleAnswersToSet(puzzle, consumedWords);
    } catch {
      // Ignore malformed puzzle files while rebuilding the consumed-word set.
    }
  }

  return consumedWords;
}

function getWordAnswerLength(word) {
  return String(word?.answer || '').trim().length;
}

function getWordZipfFrequency(word) {
  const value = Number(word?.zipfFrequency);
  return Number.isFinite(value) ? value : -5;
}

function buildEasyFocusedWordPool(themeName, availableWords) {
  const scored = [...availableWords]
    .map(word => {
      const len = getWordAnswerLength(word);
      const zipf = getWordZipfFrequency(word);
      const themeScore = scoreWordForTheme(themeName, word);
      const frequencyBand = String(word?.frequencyBand || '').toLowerCase();
      const obscurityPenalty = frequencyBand === 'obscure' ? 2.4 : frequencyBand === 'rare' ? 1.2 : 0;
      const easyScore = (themeScore * 5.2) + (Math.min(zipf, 5.5) * 1.35) - (Math.max(0, len - 5) * 1.8) - (Math.max(0, len - 7) * 2.2) - obscurityPenalty;
      return { word, len, zipf, easyScore, themeScore };
    })
    .sort((a, b) => b.easyScore - a.easyScore || b.themeScore - a.themeScore || a.len - b.len || b.zipf - a.zipf);

  const stagedPools = [
    scored.filter(item => item.len <= 8 && item.zipf >= 3.4),
    scored.filter(item => item.len <= 8 && item.zipf >= 2.8),
    scored.filter(item => item.len <= 8),
    scored.filter(item => item.len <= 9),
    scored
  ];

  const minimumPoolSize = Math.min(EASY_TOP_OFF_FOCUSED_POOL_MIN, scored.length);
  const selected = stagedPools.find(pool => pool.length >= minimumPoolSize) || scored;
  return selected.map(item => item.word);
}

async function analyzeGeneratedBatchDifficulty(index, generatedIdsThisRun) {
  const labelRank = { Normal: 0, Hard: 1, Expert: 2 };
  const generatedEntries = index.filter(entry => generatedIdsThisRun.has(entry.id));
  const labels = [];
  const candidates = [];

  for (const entry of generatedEntries) {
    const filePath = path.join(PUZZLES_DIR, `${entry.id}.json`);
    if (!fs.existsSync(filePath)) continue;

    const puzzle = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const profile = await buildDifficultyProfile(puzzle);
    const label = classifyDifficulty(profile);
    const easy = meetsEasyRubric(profile);

    labels.push(label);

    if (!easy) {
      candidates.push({
        id: entry.id,
        theme: entry.theme,
        volume: parseVolumeFromId(entry.id) || Number.MAX_SAFE_INTEGER,
        label,
        failures: collectEasyFailures(profile),
        easyMissScore: scoreEasyMismatch(profile),
        labelRank: labelRank[label] ?? 3
      });
    }
  }

  candidates.sort((a, b) =>
    a.easyMissScore - b.easyMissScore ||
    a.failures.length - b.failures.length ||
    a.labelRank - b.labelRank ||
    a.volume - b.volume ||
    a.theme.localeCompare(b.theme)
  );

  return {
    easyCount: labels.filter(label => label === 'Easy').length,
    generatedCount: labels.length,
    candidates
  };
}

async function tryEasyTopOffReplacement(candidate, historicalConsumedByTheme) {
  const theme = THEMES.find(item => item.name === candidate.theme);
  if (!theme) {
    return { replaced: false, reason: 'missing-theme' };
  }

  const volume = parseVolumeFromId(candidate.id);
  if (!volume) {
    return { replaced: false, reason: 'missing-volume' };
  }

  const consumedWords = buildThemeConsumedWords(theme.name, historicalConsumedByTheme, new Set([candidate.id]));
  const availableWords = theme.words.filter(word => !consumedWords.has(String(word.answer || '').toUpperCase()));
  const focusedWords = buildEasyFocusedWordPool(theme.name, availableWords);

  if (focusedWords.length < 10) {
    return { replaced: false, reason: 'insufficient-pool' };
  }

  let bestNearMiss = null;

  for (let attempt = 1; attempt <= EASY_TOP_OFF_ATTEMPTS_PER_SLOT; attempt++) {
    let generated;
    try {
      generated = generateThemedPuzzle(candidate.id, theme.name, focusedWords, { attemptMultiplier: EASY_TOP_OFF_ATTEMPT_MULTIPLIER });
    } catch {
      continue;
    }

    const quality = passesLayoutQualityGate(computePuzzleMetrics(generated.puzzle), generated.puzzle);
    if (!quality.duplicateClueGate) {
      continue;
    }

    const profile = await buildDifficultyProfile(generated.puzzle);
    const failures = collectEasyFailures(profile);
    const nearMiss = {
      failures,
      easyMissScore: scoreEasyMismatch(profile),
      attempt,
      qualityAccepted: quality.accepted
    };

    if (!bestNearMiss || nearMiss.easyMissScore < bestNearMiss.easyMissScore) {
      bestNearMiss = nearMiss;
    }

    if (!quality.accepted || !meetsEasyRubric(profile)) {
      continue;
    }

    generated.puzzle.title = `${theme.name} ${volume}`;
    generated.puzzle.date = formatWaveLabel(volume) || `Wave ${volume}`;
    fs.writeFileSync(path.join(PUZZLES_DIR, `${candidate.id}.json`), JSON.stringify(generated.puzzle, null, 2));

    return { replaced: true, attempt, profile, quality };
  }

  return { replaced: false, reason: 'no-easy-candidate', bestNearMiss };
}

async function runEasyTopOffPass(index, generatedIdsThisRun, historicalConsumedByTheme) {
  if (!EASY_TOP_OFF_ENABLED || THEME_FILTER_KEYS.size > 0 || generatedIdsThisRun.size === 0) {
    return;
  }

  let analysis = await analyzeGeneratedBatchDifficulty(index, generatedIdsThisRun);
  const minEasy = DIFFICULTY_RUBRIC.batchSpread.minEasy || 0;

  if (analysis.generatedCount === 0 || analysis.easyCount >= minEasy) {
    return;
  }

  if (analysis.generatedCount > EASY_TOP_OFF_MAX_BATCH_SIZE) {
    console.warn(
      `\nEasy top-off skipped: ${analysis.generatedCount} generated puzzle(s) exceeds the ${EASY_TOP_OFF_MAX_BATCH_SIZE}-puzzle top-off batch limit.`
    );
    return;
  }

  console.log(`\nEasy top-off: ${analysis.easyCount}/${analysis.generatedCount} generated puzzle(s) currently meet the Easy rubric.`);

  const attemptedIds = new Set();
  let replacements = 0;
  let attemptedCandidates = 0;

  while (
    analysis.easyCount < minEasy &&
    replacements < EASY_TOP_OFF_MAX_REPLACEMENTS &&
    attemptedCandidates < EASY_TOP_OFF_MAX_CANDIDATES
  ) {
    const candidate = analysis.candidates.find(item => !attemptedIds.has(item.id));
    if (!candidate) break;

    attemptedIds.add(candidate.id);
    attemptedCandidates += 1;
    const result = await tryEasyTopOffReplacement(candidate, historicalConsumedByTheme);

    if (!result.replaced) {
      const why = result.bestNearMiss?.failures?.length
        ? result.bestNearMiss.failures.join(', ')
        : result.reason;
      console.log(`  ↷ Easy top-off kept ${candidate.id}; closest retry still failed ${why}.`);
      continue;
    }

    replacements += 1;
    console.log(`  ✨ Easy top-off replaced ${candidate.id} after ${result.attempt} attempt(s).`);
    analysis = await analyzeGeneratedBatchDifficulty(index, generatedIdsThisRun);
  }

  if (analysis.easyCount >= minEasy) {
    console.log(`  ✅ Easy top-off reached ${analysis.easyCount} Easy puzzle(s) in this generated batch.`);
  } else {
    console.warn(`  ⚠️ Easy top-off ended at ${analysis.easyCount}/${minEasy} Easy puzzle(s) in this generated batch after ${attemptedCandidates} candidate check(s).`);
  }
}

function likelyPluralAnswer(answer) {
  const value = String(answer || '').trim().toUpperCase();
  if (value.length < 4) return false;
  if (!value.endsWith('S')) return false;
  if (value.endsWith('SS')) return false;
  return true;
}

function toSingularStem(answer) {
  const value = String(answer || '').trim().toUpperCase();
  if (!value) return value;

  if (value.endsWith('IES') && value.length > 4) {
    return `${value.slice(0, -3)}Y`;
  }

  if (value.endsWith('ES') && value.length > 4) {
    const base = value.slice(0, -2);
    if (/(S|X|Z|CH|SH)$/.test(base)) {
      return base;
    }
  }

  if (value.endsWith('S') && !value.endsWith('SS')) {
    return value.slice(0, -1);
  }

  return value;
}

function areSingularPluralPair(a, b) {
  const aVal = String(a || '').trim().toUpperCase();
  const bVal = String(b || '').trim().toUpperCase();
  if (!aVal || !bVal || aVal === bVal) return false;

  if (likelyPluralAnswer(aVal) && toSingularStem(aVal) === bVal) return true;
  if (likelyPluralAnswer(bVal) && toSingularStem(bVal) === aVal) return true;
  return false;
}

function pluralizeWord(word) {
  if (!word) return word;
  if (/s$/i.test(word)) return word;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  return `${word}s`;
}

function pluralizeTrailingWord(clueText) {
  const match = String(clueText || '').match(/^(.*\b)([A-Za-z]+)([^A-Za-z]*)$/);
  if (!match) return clueText;

  const [, prefix, lastWord, suffix] = match;
  const pluralized = pluralizeWord(lastWord);
  if (pluralized === lastWord) return clueText;
  return `${prefix}${pluralized}${suffix}`;
}

function collectPuzzleClueEntries(puzzle) {
  const entries = [];

  const acrossClues = Array.isArray(puzzle?.clues?.across) ? puzzle.clues.across : [];
  const downClues = Array.isArray(puzzle?.clues?.down) ? puzzle.clues.down : [];
  const acrossAnswers = Array.isArray(puzzle?.answers?.across) ? puzzle.answers.across : [];
  const downAnswers = Array.isArray(puzzle?.answers?.down) ? puzzle.answers.down : [];

  acrossClues.forEach((entry, idx) => {
    entries.push({
      direction: 'across',
      index: idx,
      originalEntry: entry,
      clueText: stripCluePrefix(entry),
      answer: String(acrossAnswers[idx] || '').trim().toUpperCase()
    });
  });

  downClues.forEach((entry, idx) => {
    entries.push({
      direction: 'down',
      index: idx,
      originalEntry: entry,
      clueText: stripCluePrefix(entry),
      answer: String(downAnswers[idx] || '').trim().toUpperCase()
    });
  });

  return entries;
}

function applyPluralizationToDuplicateClues(puzzle) {
  const entries = collectPuzzleClueEntries(puzzle);
  const byClueText = new Map();

  for (const entry of entries) {
    const key = entry.clueText.toLowerCase();
    if (!byClueText.has(key)) byClueText.set(key, []);
    byClueText.get(key).push(entry);
  }

  for (const group of byClueText.values()) {
    if (group.length < 2) continue;

    let hasSingularPluralPair = false;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (areSingularPluralPair(group[i].answer, group[j].answer)) {
          hasSingularPluralPair = true;
          break;
        }
      }
      if (hasSingularPluralPair) break;
    }

    if (!hasSingularPluralPair) continue;

    for (const entry of group) {
      if (!likelyPluralAnswer(entry.answer)) continue;

      const adjustedClue = pluralizeTrailingWord(entry.clueText);
      if (!adjustedClue || adjustedClue === entry.clueText) continue;

      const prefixMatch = String(entry.originalEntry || '').match(/^(\d+\.\s*)/);
      const prefix = prefixMatch ? prefixMatch[1] : '';
      const patched = `${prefix}${adjustedClue}`;

      if (entry.direction === 'across') {
        puzzle.clues.across[entry.index] = patched;
      } else {
        puzzle.clues.down[entry.index] = patched;
      }
    }
  }
}

function computeDuplicateClueSummary(puzzle) {
  const entries = collectPuzzleClueEntries(puzzle);
  const byClueText = new Map();

  for (const entry of entries) {
    const key = entry.clueText.toLowerCase().trim();
    if (!key) continue;
    if (!byClueText.has(key)) byClueText.set(key, []);
    byClueText.get(key).push(entry);
  }

  let duplicateCount = 0;
  for (const group of byClueText.values()) {
    if (group.length < 2) continue;
    const distinctAnswers = new Set(group.map(item => item.answer));
    if (distinctAnswers.size > 1) duplicateCount++;
  }

  return { duplicateCount };
}

function passesLayoutQualityGate(metrics, puzzle) {
  applyPluralizationToDuplicateClues(puzzle);

  const longWordGate = metrics.longWordCount === 0 || metrics.longWordTwoPlusRate >= MIN_LONG_TWO_PLUS_RATE;
  const veryLongWordGate =
    metrics.veryLongWordCount === 0 ||
    metrics.veryLongWordThreePlusRate >= MIN_VERY_LONG_THREE_PLUS_RATE;
  const hintCoverage = computeHintCoverage(puzzle);
  const lexicalSignals = computeLexicalObscureSignalLoad(puzzle);
  const duplicateClues = computeDuplicateClueSummary(puzzle);
  const hintGate = hintCoverage.coverage >= MIN_HINT_COVERAGE;
  const lexicalGate = lexicalSignals.load <= MAX_LEXICAL_OBSCURE_SIGNAL_LOAD;
  const duplicateClueGate = duplicateClues.duplicateCount === 0;

  return {
    accepted: longWordGate && veryLongWordGate && hintGate && lexicalGate && duplicateClueGate,
    hintCoverage,
    lexicalSignals,
    duplicateClues,
    longWordGate,
    veryLongWordGate,
    hintGate,
    lexicalGate,
    duplicateClueGate
  };
}

function selectReadyReplacementTheme(rotation, historicalConsumedByTheme) {
  const assignedKeys = new Set(
    rotation.slots
      .map(slot => normalizedThemeKey(slot?.nextTheme))
      .filter(Boolean)
  );
  const activeKeys = new Set(
    rotation.slots
      .flatMap(slot => [slot?.currentTheme, slot?.nextTheme])
      .map(normalizedThemeKey)
      .filter(Boolean)
  );

  const reports = [];
  for (const candidateName of rotation.candidates || []) {
    const candidateKey = normalizedThemeKey(candidateName);
    if (assignedKeys.has(candidateKey) || activeKeys.has(candidateKey)) continue;

    const theme = findThemeByName(THEMES, candidateName);
    if (!theme) {
      reports.push({ theme: candidateName, isReady: false, readinessFailures: ['missing theme pool'] });
      continue;
    }

    const consumedWords = buildThemeConsumedWords(theme.name, historicalConsumedByTheme);
    reports.push(analyzeThemeReadiness(theme, consumedWords, NEW_PUZZLES_PER_THEME, {
      minFutureRunwayBatches: CANDIDATE_MIN_FUTURE_RUNWAY_BATCHES
    }));
  }

  return reports
    .filter(report => report.isReady)
    .sort((a, b) =>
      b.projectedPuzzles - a.projectedPuzzles ||
      b.usableCoreWords - a.usableCoreWords ||
      b.avgCoreRelevance - a.avgCoreRelevance ||
      a.theme.localeCompare(b.theme)
    )[0] || null;
}

async function generateStarters() {
  const historicalConsumedByTheme = new Map();
  const generatedIdsThisRun = new Set();
  const rotationEnabled = THEME_FILTER_KEYS.size === 0 && !REGENERATE;
  const rotation = loadRotation();
  const activeThemes = getActiveThemesForGeneration(rotation);

  if (THEME_FILTER_KEYS.size > 0 && activeThemes.length === 0) {
    console.error('❌ NC_THEME_FILTER did not match any active themes in scripts/themes.json.');
    process.exit(2);
  }

  if (!SKIP_ENRICHMENT) {
    console.log('Enrichment step: updating theme pools before generation...');
    await fetchThemeWords();

    // proceduralEngine caches THEMES at import time, so rerun once with --skip-enrichment.
    const rerunArgs = [...process.argv.slice(1), '--skip-enrichment'];
    const rerun = spawnSync(process.execPath, rerunArgs, { stdio: 'inherit' });
    process.exit(rerun.status ?? 1);
  }

  if (!SKIP_PREFLIGHT) {
    const preflight = runGenerationPreflight({
      targetPuzzles: NEW_PUZZLES_PER_THEME,
      ignoreConsumed: REGENERATE,
      minFutureRunwayBatches: MIN_FUTURE_RUNWAY_BATCHES
    });
    if (!preflight.ok && !ALLOW_WEAK_THEMES) {
      console.error('❌ Generation preflight failed. Weak themes detected:');
      for (const weak of preflight.weakThemes) {
        console.error(
          `  - ${weak.theme} (projected ${weak.projectedPuzzles}/${weak.targetPuzzles}, future runway ${weak.futureRunwayBatches}/${weak.minFutureRunwayBatches}, usable core ${weak.usableCoreWords})`
        );
        if (weak.readinessFailures?.length) {
          console.error(`    reasons: ${weak.readinessFailures.join('; ')}`);
        }
      }
      console.error('Use --allow-weak-themes to override, or strengthen theme pools first.');
      process.exit(2);
    }
  }

  let index = [];

  console.log(`Target puzzles per theme this run: ${NEW_PUZZLES_PER_THEME}`);
  if (THEME_FILTER_KEYS.size > 0) {
    console.log(`Theme filter active: ${activeThemes.map(theme => theme.name).join(', ')}`);
  }
  
  if (REGENERATE) {
    if (!ALLOW_REPEAT_ANSWERS) {
      const existingFiles = fs.readdirSync(PUZZLES_DIR).filter(f => f.endsWith('.json'));
      for (const file of existingFiles) {
        try {
          const puzzle = JSON.parse(fs.readFileSync(path.join(PUZZLES_DIR, file), 'utf8'));
          const themeName = puzzle?.theme;
          if (!themeName) continue;

          if (!historicalConsumedByTheme.has(themeName)) {
            historicalConsumedByTheme.set(themeName, new Set());
          }
          addPuzzleAnswersToSet(puzzle, historicalConsumedByTheme.get(themeName));
        } catch {
          // Ignore malformed legacy files while collecting history.
        }
      }
    }

    console.log('🔄 REGENERATE MODE: Wiping existing puzzles and starting fresh...');
    // Delete all existing puzzle JSON files
    const existingFiles = fs.readdirSync(PUZZLES_DIR).filter(f => f.endsWith('.json'));
    for (const f of existingFiles) {
      fs.unlinkSync(path.join(PUZZLES_DIR, f));
    }
    console.log(`  Deleted ${existingFiles.length} existing puzzle files.`);
    if (!ALLOW_REPEAT_ANSWERS) {
      let historicalCount = 0;
      for (const set of historicalConsumedByTheme.values()) historicalCount += set.size;
      console.log(`  Preserved ${historicalCount} historical answers as exclusions.`);
    }
  } else {
    console.log('Generating incremental new puzzles...');
    if (fs.existsSync(INDEX_FILE)) {
      try {
        index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
      } catch(e) {
        console.warn("Could not parse existing puzzles.json, starting fresh.");
      }
    }
  }

  for (let themeIndex = 0; themeIndex < activeThemes.length; themeIndex++) {
    const theme = activeThemes[themeIndex];
    const consumedWords = new Set();
    let generatedForTheme = 0;
    let themeExhaustionReason = '';
    let caughtThemeError = null;
    let generationFailureCount = 0;
    let confirmedExhausted = false;
    if (REGENERATE && !ALLOW_REPEAT_ANSWERS) {
      const historical = historicalConsumedByTheme.get(theme.name);
      if (historical) {
        for (const answer of historical) consumedWords.add(answer);
      }
    }
    
    // Calculate the current highest committed volume for this theme from the index.
    // Disk-only files can exist after an interrupted run; those should be
    // reconciled within the current target batch, not make the next run jump
    // ahead by another full batch.
    const existingThemePuzzles = index.filter(p => p.theme === theme.name);
    let highestVol = 0;
    
    // Also scan disk for puzzle files not yet in the index
    const themeSlug = slugifyThemeName(theme.name);
    const themePrefix = `${themeSlug}-vol`;
    const legacyThemePrefix = `starter-${themeSlug}-vol`;
    const diskFiles = fs.readdirSync(PUZZLES_DIR)
      .filter(f => f.startsWith(themePrefix) || f.startsWith(legacyThemePrefix));
    
    for (const p of existingThemePuzzles) {
      const match = p.id.match(/-vol(\d+)$/);
      if (match && parseInt(match[1]) > highestVol) {
        highestVol = parseInt(match[1]);
      }
      
      // Load the actual JSON to see what words were used, to add to consumedWords
      try {
        const fileData = JSON.parse(fs.readFileSync(path.join(PUZZLES_DIR, `${p.id}.json`), 'utf8'));
        if (fileData.answers) {
            fileData.answers.across.forEach(ans => consumedWords.add(ans.toUpperCase()));
            fileData.answers.down.forEach(ans => consumedWords.add(ans.toUpperCase()));
        }
      } catch (err) {
        // file missing or corrupt, ignore
      }
    }
    
    // Also load consumed words from any disk-only puzzle files
    for (const f of diskFiles) {
      try {
        const fileData = JSON.parse(fs.readFileSync(path.join(PUZZLES_DIR, f), 'utf8'));
        if (fileData.answers) {
          fileData.answers.across.forEach(ans => consumedWords.add(ans.toUpperCase()));
          fileData.answers.down.forEach(ans => consumedWords.add(ans.toUpperCase()));
        }
      } catch (err) { /* ignore */ }
    }
    
    const startVol = highestVol + 1;
    const endVol = highestVol + NEW_PUZZLES_PER_THEME;
    console.log(`\nTheme: [${theme.name}] currently has ${highestVol} volumes. Generating vol${startVol}-${endVol}...`);

    try {
        for (let i = startVol; i <= endVol; i++) {
            const id = buildPuzzleId(theme.name, i);
            const legacyId = buildPuzzleId(theme.name, i, true);
            
            // Skip if this puzzle already exists on disk (from a previous partial run)
            const existingFile = path.join(PUZZLES_DIR, `${id}.json`);
            const legacyFile = path.join(PUZZLES_DIR, `${legacyId}.json`);
            if ((fs.existsSync(existingFile) || fs.existsSync(legacyFile)) && !index.find(p => p.id === id || p.id === legacyId)) {
              const existingPath = fs.existsSync(existingFile) ? existingFile : legacyFile;
              try {
                const existing = JSON.parse(fs.readFileSync(existingPath, 'utf8'));
                if (existing.answers) {
                  existing.answers.across.forEach(a => consumedWords.add(a.toUpperCase()));
                  existing.answers.down.forEach(a => consumedWords.add(a.toUpperCase()));
                }
                index.push({ id: existing.id, title: existing.title, author: existing.author, date: existing.date, cols: existing.size.cols, rows: existing.size.rows, theme: existing.theme });
                generatedIdsThisRun.add(existing.id);
                generatedForTheme++;
                console.log(`  ⏩ ${id} already exists on disk, added to index.`);
                continue;
              } catch(e) { /* corrupt file, regenerate */ }
            } else if (index.find(p => p.id === id || p.id === legacyId)) {
              generatedForTheme++;
              console.log(`  ⏩ ${id} already in index, skipping.`);
              continue;
            }
            
            const availableWords = dedupeWordsByClue(theme.words
              .filter(w => !consumedWords.has(w.answer.toUpperCase()))
              .sort((a, b) => {
                const aScore = scoreWordForTheme(theme.name, a);
                const bScore = scoreWordForTheme(theme.name, b);
                if (aScore === bScore) return Math.random() - 0.5;
                return bScore - aScore;
              }));
            
            if (availableWords.length < 10) {
               console.log(`Not enough available words pool for ${theme.name} to generate Vol ${i}. Add more words to themes.json or let rotation assign a successor.`);
               themeExhaustionReason = `insufficient available words for vol${i}`;
               confirmedExhausted = true;
               break;
            }

            let generated = null;
            let generatedMetrics = null;
            let generatedHintCoverage = null;
            let generatedQuality = null;
            let bestFallbackCandidate = null;
            let bestFallbackMetrics = null;
            let bestFallbackQuality = null;
            const totalAttempts = MAX_LAYOUT_QUALITY_RETRIES;

            for (let attempt = 1; attempt <= totalAttempts; attempt++) {
              let candidate;
              try {
                candidate = generateThemedPuzzle(id, theme.name, availableWords);
              } catch (err) {
                if (isExhaustibleGenerationFailure(err)) generationFailureCount++;
                if (attempt < totalAttempts) continue;
                throw err;
              }

              const candidateMetrics = computePuzzleMetrics(candidate.puzzle);
              const quality = passesLayoutQualityGate(candidateMetrics, candidate.puzzle);

              if (!quality.duplicateClueGate) {
                generationFailureCount++;
                continue;
              }

              const fallbackScore =
                (quality.hintCoverage.coverage * 1000) +
                (candidateMetrics.longWordTwoPlusRate * 100) +
                (candidateMetrics.veryLongWordThreePlusRate * 80) +
                ((1 - quality.lexicalSignals.load) * 140);
              const bestFallbackScore = bestFallbackQuality
                ? (bestFallbackQuality.hintCoverage.coverage * 1000) +
                  (bestFallbackMetrics.longWordTwoPlusRate * 100) +
                  (bestFallbackMetrics.veryLongWordThreePlusRate * 80) +
                  ((1 - bestFallbackQuality.lexicalSignals.load) * 140)
                : -Infinity;

              if (fallbackScore > bestFallbackScore) {
                bestFallbackCandidate = candidate;
                bestFallbackMetrics = candidateMetrics;
                bestFallbackQuality = quality;
              }

              if (quality.accepted) {
                generated = candidate;
                generatedMetrics = candidateMetrics;
                generatedHintCoverage = quality.hintCoverage;
                generatedQuality = quality;
                break;
              }

              if (attempt === totalAttempts && bestFallbackCandidate) {
                generated = bestFallbackCandidate;
                generatedMetrics = bestFallbackMetrics;
                generatedHintCoverage = bestFallbackQuality.hintCoverage;
                generatedQuality = bestFallbackQuality;
              }
            }

            if (!generated) {
              throw new Error(`No candidate generated for ${id}.`);
            }

            const { puzzle, usedWords: placedWords } = generated;

            if (!generatedQuality?.accepted) {
              const hintPct = ((generatedHintCoverage?.coverage || 0) * 100).toFixed(0);
              const lexicalPct = ((generatedQuality?.lexicalSignals?.load || 0) * 100).toFixed(0);
              console.warn(
                `  ⚠️ ${id} accepted below quality gates after ${totalAttempts} attempts (hint coverage ${hintPct}%, lexical signal ${lexicalPct}%, long gate ${generatedQuality?.longWordGate ? 'ok' : 'fail'}, very long gate ${generatedQuality?.veryLongWordGate ? 'ok' : 'fail'}, lexical gate ${generatedQuality?.lexicalGate ? 'ok' : 'fail'}, duplicate clue gate ${generatedQuality?.duplicateClueGate ? 'ok' : 'fail'}).`
              );
            }

            // Track the newly placed words so they aren't used in subsequent volumes
            placedWords.forEach(w => consumedWords.add(w));

            puzzle.title = `${theme.name} ${i}`;
            puzzle.date = formatWaveLabel(i) || `Wave ${i}`;
            
            // Save individual file
            fs.writeFileSync(
              path.join(PUZZLES_DIR, `${id}.json`), 
              JSON.stringify(puzzle, null, 2)
            );
            
            // Add to index
            index.push({
              id: puzzle.id,
              title: puzzle.title,
              author: puzzle.author,
              date: puzzle.date,
              cols: puzzle.size.cols,
              rows: puzzle.size.rows,
              theme: puzzle.theme
            });
            generatedIdsThisRun.add(puzzle.id);
            generatedForTheme++;
            
            const longRatePct = (generatedMetrics.longWordTwoPlusRate * 100).toFixed(0);
            const veryLongRatePct = (generatedMetrics.veryLongWordThreePlusRate * 100).toFixed(0);
            const hintCoveragePct = ((generatedHintCoverage?.coverage || 0) * 100).toFixed(0);
            const lexicalSignalPct = ((generatedQuality?.lexicalSignals?.load || 0) * 100).toFixed(0);
            const longCount = generatedMetrics.longWordCount;
            const veryLongCount = generatedMetrics.veryLongWordCount;
            console.log(
              `--> Saved ${id} (used ${placedWords.length} words, pool remaining: ${availableWords.length - placedWords.length}, long words: ${longCount}, very long: ${veryLongCount}, long 2+ cross: ${longRatePct}%, very long 3+ cross: ${veryLongRatePct}%, hint coverage: ${hintCoveragePct}% [${generatedHintCoverage?.hintCount || 0}/${generatedHintCoverage?.clueCount || 0}], lexical signal: ${lexicalSignalPct}%)`
            );
        }
    } catch (themeErr) {
        console.error(`\n❌ Failed to generate batch for theme [${theme.name}]:`, themeErr.message);
        themeExhaustionReason = themeErr.message;
        caughtThemeError = themeErr;
    }

    if (generatedForTheme < NEW_PUZZLES_PER_THEME) {
      const remainingCount = NEW_PUZZLES_PER_THEME - generatedForTheme;
      const readiness = analyzeThemeReadiness(theme, consumedWords, remainingCount, {
        minFutureRunwayBatches: 0
      });
      const outcome = decideThemeBatchOutcome({
        generatedCount: generatedForTheme,
        targetCount: NEW_PUZZLES_PER_THEME,
        readiness,
        generationFailureCount,
        generationFailureThreshold: THEME_EXHAUSTION_FAILURE_THRESHOLD
      });

      if (outcome.action === 'fail') {
        const cause = caughtThemeError?.message || themeExhaustionReason || 'unknown generation shortfall';
        throw new Error(
          `Theme ${theme.name} remains generation-ready but its batch stopped at ` +
          `${generatedForTheme}/${NEW_PUZZLES_PER_THEME}: ${cause}`
        );
      }

      confirmedExhausted = confirmedExhausted || outcome.action === 'exhaust';
      if (confirmedExhausted) {
        if (generationFailureCount >= THEME_EXHAUSTION_FAILURE_THRESHOLD) {
          themeExhaustionReason =
            `repeated generation failures (${generationFailureCount}/${THEME_EXHAUSTION_FAILURE_THRESHOLD})`;
          console.warn(`  Theme marked exhausted after ${themeExhaustionReason}.`);
        } else {
          console.warn(
            `  Theme readiness confirms exhaustion for the remaining ${remainingCount} puzzle(s): ` +
            `${readiness.readinessFailures.join('; ') || 'insufficient generation capacity'}.`
          );
        }
      }
    }

    let exhaustionTransitionHandled = false;
    if (rotationEnabled && confirmedExhausted && generatedForTheme < NEW_PUZZLES_PER_THEME) {
      const slot = markThemeExhausted(
        rotation,
        theme.name,
        themeExhaustionReason || `generated ${generatedForTheme}/${NEW_PUZZLES_PER_THEME} puzzle(s) this run`
      );

      if (slot) {
        exhaustionTransitionHandled = true;
      }

      if (!slot) {
        const replacement = selectReadyReplacementTheme(rotation, historicalConsumedByTheme);
        if (!replacement) {
          console.error(`\n❌ Scheduled theme [${theme.name}] is exhausted, but no ready candidate replacement is available.`);
          console.error('Add or enrich candidate themes in scripts/candidate-themes.json, then rerun generation.');
          throw new Error(`No ready replacement theme is available for ${theme.name}.`);
        }

        const replacedSlot = replaceScheduledTheme(
          rotation,
          theme.name,
          replacement.theme,
          themeExhaustionReason || `generated ${generatedForTheme}/${NEW_PUZZLES_PER_THEME} puzzle(s) this run`
        );
        if (replacedSlot) {
          exhaustionTransitionHandled = true;
          const replacementTheme = findThemeByName(THEMES, replacement.theme);
          if (replacementTheme) activeThemes.push(replacementTheme);
          console.log(`  🔁 Replaced exhausted scheduled theme ${theme.name} with ${replacement.theme}.`);
        }
      }

      if (slot && !slot.nextTheme) {
        const replacement = selectReadyReplacementTheme(rotation, historicalConsumedByTheme);
        if (!replacement) {
          console.error(`\n❌ Theme [${theme.name}] is exhausted, but no ready candidate replacement is available.`);
          console.error('Add or enrich candidate themes in scripts/candidate-themes.json, then rerun generation.');
          throw new Error(`No ready replacement theme is available for ${theme.name}.`);
        }

        assignNextTheme(rotation, theme.name, replacement.theme);
        const replacementTheme = findThemeByName(THEMES, replacement.theme);
        if (replacementTheme) {
          activeThemes.push(replacementTheme);
        }
        console.log(`  🔁 Marked ${theme.name} exhausted and assigned hidden successor ${replacement.theme}.`);
      }
    }

    assertSuccessfulThemeBatch({
      themeName: theme.name,
      generatedCount: generatedForTheme,
      targetCount: NEW_PUZZLES_PER_THEME,
      exhausted: exhaustionTransitionHandled
    });
  }

  // Reconcile: add any disk-only puzzle files not yet in the index
  const allDiskFiles = fs.readdirSync(PUZZLES_DIR).filter(f => f.endsWith('.json'));
  const indexedIds = new Set(index.map(p => p.id));
  for (const f of allDiskFiles) {
    const fId = f.replace('.json', '');
    if (!indexedIds.has(fId)) {
      try {
        const p = JSON.parse(fs.readFileSync(path.join(PUZZLES_DIR, f), 'utf8'));
        index.push({ id: p.id, title: p.title, author: p.author, date: p.date, cols: p.size.cols, rows: p.size.rows, theme: p.theme });
        generatedIdsThisRun.add(p.id);
        console.log(`  📎 Reconciled ${fId} into index.`);
      } catch(e) { /* skip corrupt */ }
    }
  }

  await runEasyTopOffPass(index, generatedIdsThisRun, historicalConsumedByTheme);

  // Sort index by canonical theme order, then by volume number
  const themeOrder = activeThemes.map(t => t.name);
  index.sort((a, b) => {
    const themeIdxA = themeOrder.indexOf(a.theme);
    const themeIdxB = themeOrder.indexOf(b.theme);
    if (themeIdxA !== themeIdxB) return themeIdxA - themeIdxB;
    
    const volA = parseInt((a.id.match(/-vol(\d+)$/) || [0, 0])[1]);
    const volB = parseInt((b.id.match(/-vol(\d+)$/) || [0, 0])[1]);
    return volA - volB;
  });

  // Write index
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
  console.log(`\nSuccess. Total puzzles tracked in index: ${index.length}`);
  if (rotationEnabled) {
    saveRotation(rotation);
    console.log('Updated theme rotation manifest.');
  }

  // Always refresh dataset metadata; only full regenerate runs should rotate the
  // client progress reset version.
  const syncIndexScript = path.join(__dirname, 'sync-index.cjs');
  const sync = spawnSync(process.execPath, [syncIndexScript], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NC_FORCE_PROGRESS_RESET: REGENERATE ? '1' : '0'
    }
  });
  if (sync.status !== 0) {
    console.error('❌ Failed to refresh dataset metadata via sync-index.cjs');
    process.exit(sync.status ?? 1);
  }
}

generateStarters();
