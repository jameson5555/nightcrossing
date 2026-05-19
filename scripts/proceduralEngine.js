import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateLayout } from 'crossword-layout-generator';
import { isWordEntryAcceptable } from './clueQuality.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../public/data');
const PUZZLES_DIR = path.join(DATA_DIR, 'puzzles');
const INDEX_FILE = path.join(DATA_DIR, 'puzzles.json');

// ─── Theme Database ────────────────────────────────────────────────────────
const THEMES_FILE = path.join(__dirname, 'themes.json');
const THEMES = JSON.parse(fs.readFileSync(THEMES_FILE, 'utf8'));

const MAX_GRID_ROWS = 10;
const MAX_GRID_COLS = 10;
const MIN_PLACED_WORDS = 6;
const PREFERRED_MIN_PLACED_WORDS = 7;
const MIN_WORD_TARGET = 6;
const DEFAULT_LAYOUT_ATTEMPTS = 6000;
const VERBOSE_GENERATION = process.env.NC_VERBOSE_GENERATION === '1';
const STRICT_THEME_MIN_RELEVANCE = 1.15;
const RELAXED_THEME_MIN_RELEVANCE = 0.75;
const MIN_PUZZLE_AVG_RELEVANCE = Number.isFinite(Number(process.env.NC_MIN_PUZZLE_AVG_RELEVANCE))
  ? Number(process.env.NC_MIN_PUZZLE_AVG_RELEVANCE)
  : 1.05;
const MAX_PUZZLE_LOW_RELEVANCE = Number.isFinite(Number(process.env.NC_MAX_PUZZLE_LOW_RELEVANCE))
  ? Number(process.env.NC_MAX_PUZZLE_LOW_RELEVANCE)
  : 1;
const MAX_EXTENDED_WORDS_PER_PUZZLE = Number.isFinite(Number(process.env.NC_MAX_EXTENDED_WORDS_PER_PUZZLE))
  ? Number(process.env.NC_MAX_EXTENDED_WORDS_PER_PUZZLE)
  : 2;
const ALLOW_EMERGENCY_FALLBACK = process.env.NC_ALLOW_EMERGENCY_FALLBACK === '1';
const ATTEMPT_SCALE = Number.isFinite(Number(process.env.NC_LAYOUT_ATTEMPT_SCALE))
  ? Math.max(0.2, Math.min(2, Number(process.env.NC_LAYOUT_ATTEMPT_SCALE)))
  : 1;
const LONG_WORD_LENGTH = Number.isFinite(Number(process.env.NC_LONG_WORD_LENGTH))
  ? Math.max(7, Math.min(12, Number(process.env.NC_LONG_WORD_LENGTH)))
  : 8;
const VERY_LONG_WORD_LENGTH = Number.isFinite(Number(process.env.NC_VERY_LONG_WORD_LENGTH))
  ? Math.max(LONG_WORD_LENGTH + 1, Math.min(14, Number(process.env.NC_VERY_LONG_WORD_LENGTH)))
  : 10;
const MIN_LONG_WORD_INTERSECTIONS = Number.isFinite(Number(process.env.NC_MIN_LONG_WORD_INTERSECTIONS))
  ? Math.max(1, Math.min(4, Number(process.env.NC_MIN_LONG_WORD_INTERSECTIONS)))
  : 2;
const TARGET_VERY_LONG_WORD_INTERSECTIONS = Number.isFinite(Number(process.env.NC_TARGET_VERY_LONG_WORD_INTERSECTIONS))
  ? Math.max(MIN_LONG_WORD_INTERSECTIONS, Math.min(5, Number(process.env.NC_TARGET_VERY_LONG_WORD_INTERSECTIONS)))
  : 3;
const MIN_LONG_WORD_CROSSABILITY = Number.isFinite(Number(process.env.NC_MIN_LONG_WORD_CROSSABILITY))
  ? Math.max(0.4, Math.min(2.5, Number(process.env.NC_MIN_LONG_WORD_CROSSABILITY)))
  : 1.0;
const LONG_WORD_TARGET_SHARE = Number.isFinite(Number(process.env.NC_LONG_WORD_TARGET_SHARE))
  ? Math.max(0, Math.min(0.3, Number(process.env.NC_LONG_WORD_TARGET_SHARE)))
  : 0.045;
const MAX_LAYOUT_OBSCURE_PROPER_NOUN_LOAD = Number.isFinite(Number(process.env.NC_MAX_LAYOUT_OBSCURE_PROPER_NOUN_LOAD))
  ? Math.max(0, Math.min(1, Number(process.env.NC_MAX_LAYOUT_OBSCURE_PROPER_NOUN_LOAD)))
  : 0.26;
const SPACE_LAYOUT_OBSCURE_PROPER_NOUN_LOAD = Number.isFinite(Number(process.env.NC_SPACE_LAYOUT_OBSCURE_PROPER_NOUN_LOAD))
  ? Math.max(0, Math.min(1, Number(process.env.NC_SPACE_LAYOUT_OBSCURE_PROPER_NOUN_LOAD)))
  : 0.2;
const PRIMARY_CORE_POOL_LIMIT = Number.isFinite(Number(process.env.NC_PRIMARY_CORE_POOL_LIMIT))
  ? Math.max(18, Math.min(120, Number(process.env.NC_PRIMARY_CORE_POOL_LIMIT)))
  : 48;

const LAYOUT_OBSCURE_PROPER_NOUN_REGEX = /\b(goddess|god|deity|mythological|myth|constellation|kuiper|planetoid|primordial|trojan|tau\s+[a-z]+|mistress\s+of\s+zeus|one\s+of\s+the\s+moons\s+of\s+jupiter|pegasi|uranian|salacia|aoede|elara|amalthea|ganymede|callisto)\b/i;

const SCORE_WEIGHTS = {
  minIntersection: 42,
  avgIntersection: 56,
  totalIntersection: 7,
  minTwoBonus: 42,
  longWordTwoPlusBonus: 18,
  veryLongWordThreePlusBonus: 22,
  longWordMissPenalty: 26,
  veryLongWordMissPenalty: 28,
  avgAnswerPenalty: 12,
  excessLongWordPenalty: 18,
  excessVeryLongWordPenalty: 20,
  wordCount: 6,
  placedRatio: 8,
  wordFloorBonus: 0,
  density: 6,
  squareBonus: 3,
  ratioPenalty: 3.5
};

const SOURCE_RELIABILITY_ADJUSTMENTS = {
  seed: 0.12,
  'wikidata-search': 0.03,
  'wikipedia-category': 0,
  'wikipedia-subcategory': -0.03,
  'wordnet-synonym': 0.02,
  ml: 0,
  rel_jjb: -0.14,
  rel_jja: -0.14,
  rel_spc: -0.12,
  rel_trg: -0.1
};

const SOURCE_THEME_SCORE_CAP_BONUS = {
  seed: 0.35,
  'wikidata-search': 0.05,
  'wikipedia-category': 0.06,
  'wikipedia-subcategory': 0.03,
  'wordnet-synonym': 0.06,
  ml: 0.08,
  rel_jjb: 0,
  rel_jja: 0,
  rel_spc: 0.02,
  rel_trg: 0.02
};

function shuffleArray(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function buildLetterFrequency(words) {
  const freq = new Map();
  for (const word of words) {
    const uniqueChars = new Set(word.answer.toLowerCase().replace(/[^a-z]/g, ''));
    for (const ch of uniqueChars) {
      freq.set(ch, (freq.get(ch) || 0) + 1);
    }
  }
  return freq;
}

function wordCrossabilityScore(answer, letterFrequency) {
  const uniqueChars = new Set(answer.toLowerCase().replace(/[^a-z]/g, ''));
  if (uniqueChars.size === 0) return 0;

  let score = 0;
  for (const ch of uniqueChars) {
    const count = letterFrequency.get(ch) || 0;
    score += Math.max(0, count - 1);
  }

  return score / uniqueChars.size;
}

function themeRelevanceScore(word) {
  if (typeof word?._themeRankScore === 'number') return word._themeRankScore;
  return typeof word.themeScore === 'number' ? word.themeScore : 0;
}

function lexicalEasePreference(word) {
  const zipfFrequency = Number(word?.zipfFrequency);
  if (!Number.isFinite(zipfFrequency)) return 0;
  if (zipfFrequency <= 3.1) return 0;
  return Math.min(0.32, (zipfFrequency - 3.1) * 0.22);
}

function tokenizeForTheme(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 3);
}

function normalizedThemeKey(themeName) {
  const normalized = String(themeName || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (normalized === 'space sky') return 'space astronomy';
  return normalized;
}

function calculateFallbackThemeRelevance(themeName, word) {
  const themeTokens = tokenizeForTheme(themeName);
  if (themeTokens.length === 0) return 0;

  const themeTokenSet = new Set(themeTokens);
  const answerTokens = tokenizeForTheme(word.answer);
  const clueTokens = tokenizeForTheme(word.clue);
  const hintTokens = tokenizeForTheme(word.hint);

  let score = 0.35;

  const answerOverlap = answerTokens.filter(token => themeTokenSet.has(token)).length;
  const clueOverlap = clueTokens.filter(token => themeTokenSet.has(token)).length;
  const hintOverlap = hintTokens.filter(token => themeTokenSet.has(token)).length;

  score += Math.min(0.85, answerOverlap * 0.45);
  score += Math.min(0.95, clueOverlap * 0.2);
  score += Math.min(0.5, hintOverlap * 0.14);

  const answer = (word.answer || '').toLowerCase();
  for (const themeToken of themeTokens) {
    if (answer.includes(themeToken)) score += 0.35;
    if (themeToken.includes(answer) && answer.length >= 4) score += 0.2;
  }

  // Keep obvious, high-signal domains available even when clue text is sparse.
  const domainSignals = {
    'space astronomy': ['orbit', 'star', 'planet', 'moon', 'solar', 'lunar', 'cosmic', 'galaxy', 'rocket', 'saturn', 'venus', 'mars', 'pluto', 'nebula', 'astro'],
    'food cooking': ['cook', 'bake', 'fry', 'grill', 'dish', 'meal', 'spice', 'kitchen', 'chef', 'recipe', 'broth', 'sauce'],
    'ocean marine life': ['ocean', 'sea', 'tide', 'reef', 'fish', 'whale', 'shark', 'coral', 'marine', 'kelp', 'naut', 'sail'],
    'music sound': ['music', 'song', 'note', 'tune', 'rhythm', 'melody', 'chord', 'tempo', 'audio', 'sound', 'drum', 'piano', 'guitar'],
    'weather climate': ['weather', 'climate', 'storm', 'rain', 'wind', 'cloud', 'snow', 'sun', 'solar', 'sky', 'forecast', 'season', 'breeze', 'gale', 'frost', 'thunder', 'lightning', 'atmos', 'meteor'],
    'plants gardens': ['plant', 'garden', 'leaf', 'tree', 'flower', 'bloom', 'seed', 'stem', 'root', 'fern', 'moss', 'shrub', 'vine', 'petal', 'orchid', 'cactus', 'pollen', 'flora', 'herb', 'botan'],
    'internet software': ['internet', 'web', 'browser', 'server', 'cloud', 'code', 'coding', 'program', 'software', 'query', 'cache', 'file', 'files', 'sync', 'network', 'node', 'nodes', 'protocol', 'database', 'cyber', 'byte', 'chip', 'cpu', 'hash', 'api', 'online', 'digital'],
    'sports athletics': ['sport', 'team', 'score', 'goal', 'match', 'coach', 'league', 'athlete', 'race', 'medal', 'tournament']
  };

  const themeKey = normalizedThemeKey(themeName);
  const signals = domainSignals[themeKey] || [];
  const combinedText = `${word.answer || ''} ${word.clue || ''} ${word.hint || ''}`.toLowerCase();
  const matchedSignals = signals.filter(signal => combinedText.includes(signal)).length;
  if (matchedSignals > 0) {
    score += 0.65;
    if (matchedSignals >= 2) score += 0.15;
    if (matchedSignals >= 3) score += 0.1;
  }

  const answerLen = (word.answer || '').length;
  if (answerLen >= 4 && answerLen <= 8) score += 0.08;
  if (answerLen >= 9 && answerLen <= 10) score += 0.04;

  return Math.max(0, Math.min(2.5, Number(score.toFixed(3))));
}

export function scoreWordForTheme(themeName, word) {
  const fallbackScore = calculateFallbackThemeRelevance(themeName, word);
  const sourceKey = word?.source || 'seed';
  const sourceAdjustment = SOURCE_RELIABILITY_ADJUSTMENTS[sourceKey] || 0;
  const sourceThemeScoreCapBonus = SOURCE_THEME_SCORE_CAP_BONUS[sourceKey] ?? 0.1;
  if (typeof word.themeScore === 'number') {
    const cappedScore = Math.min(
      word.themeScore + sourceAdjustment,
      fallbackScore + sourceThemeScoreCapBonus + sourceAdjustment
    );
    return Math.max(0, Number(cappedScore.toFixed(3)));
  }

  return Math.max(0, Number((fallbackScore + sourceAdjustment).toFixed(3)));
}

export function createThemePools(themeName, words) {
  const scoredWords = words
    .filter(word => isWordEntryAcceptable({
      answer: word?.answer || '',
      clue: word?.clue || '',
      hint: word?.hint || ''
    }).ok)
    .map(word => ({
      score: scoreWordForTheme(themeName, word),
      word
    }))
    .map(item => ({
      ...item,
      word: {
        ...item.word,
        _themeRankScore: item.score
      }
    }))
    .sort((a, b) => b.score - a.score);

  const coreWords = scoredWords
    .filter(item => item.score >= STRICT_THEME_MIN_RELEVANCE)
    .map(item => item.word);

  const extendedWords = scoredWords
    .filter(item => item.score >= RELAXED_THEME_MIN_RELEVANCE && item.score < STRICT_THEME_MIN_RELEVANCE)
    .map(item => item.word);

  const relevanceByAnswer = new Map(
    scoredWords.map(item => [item.word.answer.toUpperCase(), item.score])
  );

  return {
    coreWords,
    extendedWords,
    rankedWords: scoredWords.map(item => item.word),
    relevanceByAnswer
  };
}

function withLimitedExtended(coreWords, extendedWords, maxExtendedWords) {
  if (maxExtendedWords <= 0) return [...coreWords];
  return [...coreWords, ...extendedWords.slice(0, maxExtendedWords)];
}

function hasUsableHint(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function layoutPassesThemeGuardrails(layout, relevanceByAnswer, options = {}) {
  if (!layout || !Array.isArray(layout.result) || layout.result.length === 0) return false;

  const minAvgRelevance = options.minAvgRelevance ?? MIN_PUZZLE_AVG_RELEVANCE;
  const lowRelevanceThreshold = options.lowRelevanceThreshold ?? RELAXED_THEME_MIN_RELEVANCE;
  const maxLowRelevance = options.maxLowRelevance ?? MAX_PUZZLE_LOW_RELEVANCE;

  let sum = 0;
  let lowCount = 0;

  for (const placed of layout.result) {
    const score = relevanceByAnswer.get((placed.answer || '').toUpperCase()) || 0;
    sum += score;
    if (score < lowRelevanceThreshold) {
      lowCount++;
    }
  }

  const avg = sum / layout.result.length;
  return avg >= minAvgRelevance && lowCount <= maxLowRelevance;
}

function layoutPassesLexicalGuardrails(layout, options = {}) {
  if (!layout || !Array.isArray(layout.result) || layout.result.length === 0) return false;

  const normalizedTheme = normalizedThemeKey(options.themeName || '');
  const defaultMaxLoad = normalizedTheme === 'space astronomy'
    ? SPACE_LAYOUT_OBSCURE_PROPER_NOUN_LOAD
    : MAX_LAYOUT_OBSCURE_PROPER_NOUN_LOAD;
  const maxObscureProperNounLoad = options.maxObscureProperNounLoad ?? defaultMaxLoad;

  let obscureHits = 0;
  for (const placed of layout.result) {
    const clue = String(placed?.clue || '');
    const hint = String(placed?.hint || '');
    const joined = `${clue} ${hint}`.trim();
    if (LAYOUT_OBSCURE_PROPER_NOUN_REGEX.test(joined)) {
      obscureHits++;
    }
  }

  const obscureLoad = obscureHits / layout.result.length;
  return obscureLoad <= maxObscureProperNounLoad;
}

function buildLayoutIntersectionStats(layout) {
  const words = Array.isArray(layout?.result) ? layout.result : [];
  if (words.length === 0) {
    return {
      intersectionsPerWord: [],
      avgIntersectionsPerWord: 0,
      minIntersectionsPerWord: 0,
      avgAnswerLength: 0,
      longWordCount: 0,
      veryLongWordCount: 0
    };
  }

  const intersectionsPerWord = new Array(words.length).fill(0);

  for (let w1 = 0; w1 < words.length; w1++) {
    for (let w2 = w1 + 1; w2 < words.length; w2++) {
      const wordA = words[w1];
      const wordB = words[w2];
      if (wordA.orientation === wordB.orientation) continue;

      const hWord = wordA.orientation === 'across' ? wordA : wordB;
      const vWord = wordA.orientation === 'down' ? wordA : wordB;

      if (
        vWord.startx >= hWord.startx &&
        vWord.startx < hWord.startx + hWord.answer.length &&
        hWord.starty >= vWord.starty &&
        hWord.starty < vWord.starty + vWord.answer.length
      ) {
        intersectionsPerWord[w1]++;
        intersectionsPerWord[w2]++;
      }
    }
  }

  const lengths = words.map(word => (word?.answer || '').length);
  const avgIntersectionsPerWord = intersectionsPerWord.reduce((sum, n) => sum + n, 0) / intersectionsPerWord.length;
  const minIntersectionsPerWord = Math.min(...intersectionsPerWord);
  const avgAnswerLength = lengths.reduce((sum, len) => sum + len, 0) / lengths.length;
  const longWordCount = lengths.filter(len => len >= LONG_WORD_LENGTH).length;
  const veryLongWordCount = lengths.filter(len => len >= VERY_LONG_WORD_LENGTH).length;

  return {
    intersectionsPerWord,
    avgIntersectionsPerWord,
    minIntersectionsPerWord,
    avgAnswerLength,
    longWordCount,
    veryLongWordCount
  };
}

function choosePrimaryPool(pools, themeName = '') {
  const focusedCoreWords = pools.coreWords.slice(0, Math.min(PRIMARY_CORE_POOL_LIMIT, pools.coreWords.length));
  const anchoredCoreWords = focusedCoreWords.filter(word => hasLexicalThemeAnchor(themeName, word));
  const anchoredExtendedWords = pools.extendedWords.filter(word => hasLexicalThemeAnchor(themeName, word));

  if (anchoredCoreWords.length >= 14) {
    return anchoredCoreWords;
  }

  if (focusedCoreWords.length >= 14) {
    return focusedCoreWords;
  }

  if (anchoredCoreWords.length >= 10) {
    return withLimitedExtended(
      anchoredCoreWords,
      anchoredExtendedWords,
      Math.max(1, Math.min(MAX_EXTENDED_WORDS_PER_PUZZLE, anchoredExtendedWords.length))
    );
  }

  if (focusedCoreWords.length >= 10) {
    return withLimitedExtended(
      focusedCoreWords,
      pools.extendedWords,
      Math.max(1, Math.min(MAX_EXTENDED_WORDS_PER_PUZZLE, pools.extendedWords.length))
    );
  }

  const targetCoreFill = Math.max(0, 12 - focusedCoreWords.length);
  if (focusedCoreWords.length + pools.extendedWords.length >= 10) {
    return withLimitedExtended(
      focusedCoreWords,
      pools.extendedWords,
      Math.max(targetCoreFill, Math.min(MAX_EXTENDED_WORDS_PER_PUZZLE, pools.extendedWords.length))
    );
  }

  return pools.rankedWords;
}

function hasLexicalThemeAnchor(themeName, word) {
  const normalizedTheme = normalizedThemeKey(themeName || '');
  if (!normalizedTheme) return true;

  const themeTokens = tokenizeForTheme(normalizedTheme);
  const themeTokenSet = new Set(themeTokens);
  const answerTokens = tokenizeForTheme(word?.answer || '');
  const clueTokens = tokenizeForTheme(word?.clue || '');
  const combinedTokens = [...answerTokens, ...clueTokens];

  if (answerTokens.some(token => themeTokenSet.has(token))) return true;
  if (clueTokens.some(token => themeTokenSet.has(token))) return true;

  const domainSignals = {
    'space astronomy': ['orbit', 'star', 'planet', 'moon', 'solar', 'lunar', 'cosmic', 'galaxy', 'rocket', 'saturn', 'venus', 'mars', 'pluto', 'nebula', 'astro'],
    'food cooking': ['cook', 'bake', 'fry', 'grill', 'dish', 'meal', 'spice', 'kitchen', 'chef', 'recipe', 'broth', 'sauce'],
    'ocean marine life': ['ocean', 'sea', 'tide', 'reef', 'fish', 'whale', 'shark', 'coral', 'marine', 'kelp', 'naut', 'sail'],
    'music sound': ['music', 'song', 'note', 'tune', 'rhythm', 'melody', 'chord', 'tempo', 'audio', 'sound', 'drum', 'piano', 'guitar'],
    'weather climate': ['weather', 'climate', 'storm', 'rain', 'wind', 'cloud', 'snow', 'sun', 'solar', 'sky', 'forecast', 'season', 'breeze', 'gale', 'frost', 'thunder', 'lightning', 'atmos', 'meteor'],
    'plants gardens': ['plant', 'garden', 'leaf', 'tree', 'flower', 'bloom', 'seed', 'stem', 'root', 'fern', 'moss', 'shrub', 'vine', 'petal', 'orchid', 'cactus', 'pollen', 'flora', 'herb', 'botan'],
    'internet software': ['internet', 'web', 'browser', 'server', 'cloud', 'code', 'coding', 'program', 'software', 'query', 'cache', 'file', 'files', 'sync', 'network', 'node', 'nodes', 'protocol', 'database', 'cyber', 'byte', 'chip', 'cpu', 'hash', 'api', 'online', 'digital'],
    'sports athletics': ['sport', 'team', 'score', 'goal', 'match', 'coach', 'league', 'athlete', 'race', 'medal', 'tournament']
  };

  return (domainSignals[normalizedTheme] || [])
    .filter(signal => signal.length >= 3)
    .some(signal => combinedTokens.some(token => token === signal || token.startsWith(signal)));
}

function pickCandidateSubset(words, maxWords, letterFrequency, options = {}) {
  if (words.length <= maxWords) {
    return shuffleArray(words);
  }

  const scored = words.map(word => {
    const len = word.answer.length;
    const crossability = wordCrossabilityScore(word.answer, letterFrequency);
    const themeScore = themeRelevanceScore(word);
    const lexicalEase = lexicalEasePreference(word);
    const lenSuitability =
      len <= 4 ? 1.25 :
      len <= 7 ? 1.8 :
      len <= 9 ? 0.75 :
      len <= 10 ? 0.15 :
      0;

    // Crossability is useful, but its raw scale is much larger than theme relevance.
    // Compress it so strongly thematic entries are not crowded out by merely easy letter patterns.
    const normalizedCrossability = Math.sqrt(Math.max(0, crossability));
    const strongThemeFloor = STRICT_THEME_MIN_RELEVANCE + 0.12;
    const themePenalty = themeScore < strongThemeFloor
      ? (strongThemeFloor - themeScore) * 4.5
      : 0;
    const anchored = hasLexicalThemeAnchor(options.themeName, word);
    const lexicalPenalty = anchored ? 0 : 2.8;
    const priority = (normalizedCrossability * 2.35) + (themeScore * 5.2) + lenSuitability + lexicalEase - themePenalty - lexicalPenalty;
    return { word, len, crossability, normalizedCrossability, themeScore, anchored, lexicalEase, priority };
  });

  const longStrong = shuffleArray(
    scored.filter(item => item.len >= LONG_WORD_LENGTH && item.crossability >= MIN_LONG_WORD_CROSSABILITY)
  ).sort((a, b) => b.priority - a.priority);
  const longWeak = shuffleArray(
    scored.filter(item => item.len >= LONG_WORD_LENGTH && item.crossability < MIN_LONG_WORD_CROSSABILITY)
  ).sort((a, b) => b.priority - a.priority);
  const medium = shuffleArray(scored.filter(item => item.len >= 5 && item.len <= 7)).sort((a, b) => b.priority - a.priority);
  const short = shuffleArray(scored.filter(item => item.len <= 4)).sort((a, b) => b.priority - a.priority);

  const targetLong = Math.min(longStrong.length, Math.max(0, Math.round(maxWords * LONG_WORD_TARGET_SHARE)));
  const targetShort = Math.min(short.length, Math.max(2, Math.round(maxWords * 0.33)));
  const targetMedium = Math.max(0, maxWords - targetLong - targetShort);

  const selected = [];
  const selectedSet = new Set();

  const takeFromBucket = (bucket, count) => {
    let taken = 0;
    for (const item of bucket) {
      if (taken >= count || selected.length >= maxWords) break;
      if (selectedSet.has(item.word.answer)) continue;
      selected.push(item);
      selectedSet.add(item.word.answer);
      taken++;
    }
  };

  takeFromBucket(longStrong, targetLong);
  takeFromBucket(medium, targetMedium);
  takeFromBucket(short, targetShort);

  const leftovers = shuffleArray([...medium, ...short, ...longWeak, ...longStrong])
    .filter(item => !selectedSet.has(item.word.answer))
    .sort((a, b) => b.priority - a.priority || b.lexicalEase - a.lexicalEase || b.themeScore - a.themeScore);

  for (const item of leftovers) {
    if (selected.length >= maxWords) break;
    selected.push(item);
  }

  return selected
    .sort((a, b) => (b.priority + Math.random() * 1.2) - (a.priority + Math.random() * 1.2))
    .slice(0, maxWords)
    .map(item => item.word);
}

function scaledAttempts(baseAttempts) {
  return Math.max(400, Math.round(baseAttempts * ATTEMPT_SCALE));
}

// ─── Puzzle Generation Engine ──────────────────────────────────────────────
function generateBestLayout(
  words,
  attempts = DEFAULT_LAYOUT_ATTEMPTS,
  maxWords = 18,
  minPlacedWords = MIN_PLACED_WORDS,
  options = {}
) {
  let best = null;
  let bestScore = -1000;
  const enforceLongIntersections = options.enforceLongIntersections ?? true;
  const allowLongMisses = options.allowLongMisses ?? 0;

  // Pre-filter: reject weak, unsafe, or low-quality clue entries.
  const preFiltered = words.filter(w => {
    if (w.clue.length > 80) return false;
    if (w.answer.length > Math.max(MAX_GRID_ROWS, MAX_GRID_COLS)) return false;
    if (!hasUsableHint(w.hint) && w.answer.length >= 6) return false;

    const qualityCheck = isWordEntryAcceptable({
      answer: w.answer,
      clue: w.clue,
      hint: w.hint || null
    });

    return qualityCheck.ok;
  });

  if (preFiltered.length < 6) {
    console.warn(`  Warning: Only ${preFiltered.length} words survive clue-safety filter`);
  }

  const letterFrequency = buildLetterFrequency(preFiltered);

  for (let i = 0; i < attempts; i++) {
    const subset = Math.random() < 0.15
      ? shuffleArray(preFiltered).slice(0, maxWords)
      : pickCandidateSubset(preFiltered, maxWords, letterFrequency, { themeName: options.themeName });
    const input = subset.map(w => ({ 
      answer: w.answer.toLowerCase(), 
      clue: w.clue,
      hint: w.hint || null 
    }));
    let layout;
    // The layout library is very chatty; silence it for generation throughput/log clarity.
    const originalLog = console.log;
    console.log = () => {};
    try {
      layout = generateLayout(input);
    } finally {
      console.log = originalLog;
    }
    layout.result = layout.result.filter(w => w.orientation === 'across' || w.orientation === 'down');
    
    // Re-attach hints as the generator might strip them
    layout.result.forEach(r => {
      const source = input.find(i => i.answer === r.answer);
      if (source) r.hint = source.hint;
    });
    
    // Trim early to check true dimensions
    layout = trimGrid(layout);
    if (!layout.table || layout.rows === 0 || layout.cols === 0) continue;
    
    // Enforce 10x10 size limits to keep puzzles compact and readable on mobile
    if (layout.rows > MAX_GRID_ROWS || layout.cols > MAX_GRID_COLS) continue;

    // Reject layouts with too few words placed
    if (layout.result.length < minPlacedWords) continue;

    let filled = 0;
    for (let r = 0; r < layout.rows; r++) {
      for (let c = 0; c < layout.cols; c++) {
        if (layout.table[r][c] !== '-') filled++;
      }
    }
    
    // Calculate word intersections and build adjacency graph
    let wordIntersections = new Array(layout.result.length).fill(0);
    let adj = new Array(layout.result.length).fill(0).map(() => []);
    
    for (let w1 = 0; w1 < layout.result.length; w1++) {
      for (let w2 = w1 + 1; w2 < layout.result.length; w2++) {
        const wordA = layout.result[w1];
        const wordB = layout.result[w2];
        if (wordA.orientation !== wordB.orientation) {
          const hWord = wordA.orientation === 'across' ? wordA : wordB;
          const vWord = wordA.orientation === 'down' ? wordA : wordB;
          
          if (vWord.startx >= hWord.startx && vWord.startx < hWord.startx + hWord.answer.length &&
              hWord.starty >= vWord.starty && hWord.starty < vWord.starty + vWord.answer.length) {
              wordIntersections[w1]++;
              wordIntersections[w2]++;
              adj[w1].push(w2);
              adj[w2].push(w1);
          }
        }
      }
    }
    
    // Validate that the entire puzzle forms exactly ONE connected component
    let visited = new Set();
    const dfs = (node) => {
        if (visited.has(node)) return;
        visited.add(node);
        adj[node].forEach(dfs);
    };
    if (layout.result.length > 0) dfs(0);
    if (visited.size < layout.result.length && layout.result.length > 1) continue;
    
    const minIntersections = layout.result.length > 0 ? Math.min(...wordIntersections) : 0;
    const sumIntersections = wordIntersections.reduce((a, b) => a + b, 0);
    const avgIntersections = layout.result.length > 0 ? sumIntersections / layout.result.length : 0;
    const totalIntersections = sumIntersections / 2;

    let longWordCount = 0;
    let longWordsAtMin = 0;
    let veryLongWordCount = 0;
    let veryLongWordsAtTarget = 0;
    let totalAnswerLength = 0;

    for (let idx = 0; idx < layout.result.length; idx++) {
      const answerLength = (layout.result[idx]?.answer || '').length;
      const crossings = wordIntersections[idx] || 0;
      totalAnswerLength += answerLength;
      if (answerLength >= LONG_WORD_LENGTH) {
        longWordCount++;
        if (crossings >= MIN_LONG_WORD_INTERSECTIONS) {
          longWordsAtMin++;
        }
      }
      if (answerLength >= VERY_LONG_WORD_LENGTH) {
        veryLongWordCount++;
        if (crossings >= TARGET_VERY_LONG_WORD_INTERSECTIONS) {
          veryLongWordsAtTarget++;
        }
      }
    }

    const longWordMisses = Math.max(0, longWordCount - longWordsAtMin);
    if (enforceLongIntersections && longWordMisses > allowLongMisses) {
      continue;
    }

    const total = layout.rows * layout.cols;
    const density = filled / total;
    const placedRatio = layout.result.length / maxWords;
  const avgAnswerLength = layout.result.length > 0 ? totalAnswerLength / layout.result.length : 0;
  const targetLongWordCount = Math.max(1, Math.round(layout.result.length * LONG_WORD_TARGET_SHARE));
  const targetVeryLongWordCount = Math.max(0, Math.round(layout.result.length * (LONG_WORD_TARGET_SHARE * 0.5)));
    
    // Penalize highly rectangular/not-square grids
    const ratio = Math.max(layout.rows / layout.cols, layout.cols / layout.rows);
    const ratioPenalty = ratio > 1.25 ? (ratio - 1.25) * SCORE_WEIGHTS.ratioPenalty : 0;
    const squareBonus = ratio <= 1.15 ? SCORE_WEIGHTS.squareBonus : 0;

    // Priority order: overlaps first, with only a light bias toward fuller grids.
    const overlapScore =
      (minIntersections * SCORE_WEIGHTS.minIntersection) +
      (avgIntersections * SCORE_WEIGHTS.avgIntersection) +
      (totalIntersections * SCORE_WEIGHTS.totalIntersection) +
      (minIntersections >= 2 ? SCORE_WEIGHTS.minTwoBonus : 0);

    const longWordScore =
      (longWordsAtMin * SCORE_WEIGHTS.longWordTwoPlusBonus) +
      (veryLongWordsAtTarget * SCORE_WEIGHTS.veryLongWordThreePlusBonus) -
      (longWordMisses * SCORE_WEIGHTS.longWordMissPenalty) -
      (Math.max(0, veryLongWordCount - veryLongWordsAtTarget) * SCORE_WEIGHTS.veryLongWordMissPenalty);

    const wordCountScore =
      (layout.result.length * SCORE_WEIGHTS.wordCount) +
      (placedRatio * SCORE_WEIGHTS.placedRatio);
    const wordFloorBonus = layout.result.length >= PREFERRED_MIN_PLACED_WORDS
      ? SCORE_WEIGHTS.wordFloorBonus
      : 0;

    const densityScore = density * SCORE_WEIGHTS.density;
    const avgAnswerPenalty = Math.max(0, avgAnswerLength - 5.7) * SCORE_WEIGHTS.avgAnswerPenalty;
    const excessLongWordPenalty = Math.max(0, longWordCount - targetLongWordCount) * SCORE_WEIGHTS.excessLongWordPenalty;
    const excessVeryLongWordPenalty = Math.max(0, veryLongWordCount - targetVeryLongWordCount) * SCORE_WEIGHTS.excessVeryLongWordPenalty;

    const score = overlapScore + longWordScore + wordCountScore + wordFloorBonus + densityScore + squareBonus - ratioPenalty - avgAnswerPenalty - excessLongWordPenalty - excessVeryLongWordPenalty;

    if (score > bestScore) {
      bestScore = score;
      best = layout;
    }
  }

  if (best) {
    best._engineScore = bestScore;
  }

  return best;
}

function trimGrid(layout) {
  const table = layout.table;
  const rows = table.length;
  const cols = table[0].length;

  let minR = rows, maxR = 0, minC = cols, maxC = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (table[r][c] !== '-') {
        minR = Math.min(minR, r);
        maxR = Math.max(maxR, r);
        minC = Math.min(minC, c);
        maxC = Math.max(maxC, c);
      }
    }
  }

  const trimmed = [];
  for (let r = minR; r <= maxR; r++) {
    const row = [];
    for (let c = minC; c <= maxC; c++) {
      row.push(table[r][c]);
    }
    trimmed.push(row);
  }

  // Update word positions
  const result = layout.result.map(item => ({
    ...item,
    startx: item.startx - minC,
    starty: item.starty - minR
  }));

  return {
    table: trimmed,
    result,
    rows: trimmed.length,
    cols: trimmed[0].length
  };
}

function layoutToNightcrossing(layout, id, title, themeName) {
  // If already trimmed by generateBestLayout, we can still run it safely
  const trimmed = trimGrid(layout);
  const { table, result, rows, cols } = trimmed;

  const grid = Array(rows * cols).fill('.');
  const gridnums = Array(rows * cols).fill(0);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = table[r][c];
      if (ch && ch !== '-') {
        grid[r * cols + c] = ch.toUpperCase();
      }
    }
  }

  const clues = { across: [], down: [] };
  const answers = { across: [], down: [] };
  const hints = {};
  let missingHintCount = 0;

  // Generate standard crossword numbering
  let currentNum = 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const startingWords = result.filter(w => w.startx - 1 === c && w.starty - 1 === r);
      if (startingWords.length > 0) {
        gridnums[r * cols + c] = currentNum;
        for (let w of startingWords) {
          w.position = currentNum;
        }
        currentNum++;
      }
    }
  }

  // Sort by position number before pushing to clues
  result.sort((a, b) => a.position - b.position);

  result.forEach(item => {
    const prefix = `${item.position}. `;
    const id = `${item.orientation}-${item.position}`;
    
    if (item.orientation === 'across') {
      clues.across.push(prefix + item.clue);
      answers.across.push(item.answer.toUpperCase());
    } else {
      clues.down.push(prefix + item.clue);
      answers.down.push(item.answer.toUpperCase());
    }
    
    const normalizedHint = hasUsableHint(item.hint) ? item.hint.trim() : '';
    if (normalizedHint) {
      hints[id] = normalizedHint;
    } else {
      missingHintCount++;
    }
  });

  if (missingHintCount > 0 && VERBOSE_GENERATION) {
    console.warn(`  Hint coverage warning for ${id}: ${missingHintCount} clue(s) missing hints.`);
  }

  return {
    id,
    title,
    theme: themeName,
    author: "Nightcrossing Engine",
    date: id,
    size: { cols, rows },
    grid,
    gridnums,
    clues,
    answers,
    hints
  };
}

export function generateThemedPuzzle(id, themeName, availableWords, options = {}) {
  const perCallAttemptMultiplier = Number.isFinite(Number(options.attemptMultiplier))
    ? Math.max(0.5, Math.min(4, Number(options.attemptMultiplier)))
    : 1;
  const attemptBudget = (baseAttempts) => scaledAttempts(Math.max(1, Math.round(baseAttempts * perCallAttemptMultiplier)));
  const pools = createThemePools(themeName, availableWords);
  const themedWords = choosePrimaryPool(pools, themeName);

  if (VERBOSE_GENERATION) {
    console.log(
      `Theme: ${themeName} | Available: ${availableWords.length} | Core: ${pools.coreWords.length} | Extended: ${pools.extendedWords.length} | Active: ${themedWords.length}`
    );
  }

  let layout = null;
  let bestScore = -Infinity;
  let maxWordsTry = Math.min(14, themedWords.length);

  while (maxWordsTry >= MIN_WORD_TARGET) {
    const attempts = attemptBudget(
    maxWordsTry >= 13 ? 3000 :
    maxWordsTry >= 11 ? 2300 :
    maxWordsTry >= 9 ? 1700 :
    1300
    );

    const requiredPlaced = Math.min(maxWordsTry, Math.max(PREFERRED_MIN_PLACED_WORDS, Math.floor(maxWordsTry * 0.7)));
    const candidate = generateBestLayout(
      themedWords,
      attempts,
      maxWordsTry,
      requiredPlaced,
      { enforceLongIntersections: true, allowLongMisses: 0, themeName }
    );
    if (
      candidate &&
      layoutPassesThemeGuardrails(candidate, pools.relevanceByAnswer) &&
      layoutPassesLexicalGuardrails(candidate, { themeName })
    ) {
      const candidateScore = typeof candidate._engineScore === 'number' ? candidate._engineScore : -Infinity;
      if (candidateScore > bestScore) {
        bestScore = candidateScore;
        layout = candidate;
      }
    }

    maxWordsTry--;
  }

  if (!layout) {
    // Fallback: one final dense-search pass on a small target set under the 10x10 cap.
    const fallback = generateBestLayout(
      themedWords,
      attemptBudget(2500),
      MIN_WORD_TARGET,
      Math.min(MIN_PLACED_WORDS, MIN_WORD_TARGET),
      { enforceLongIntersections: true, allowLongMisses: 1, themeName }
    );
    if (
      fallback &&
      layoutPassesThemeGuardrails(fallback, pools.relevanceByAnswer) &&
      layoutPassesLexicalGuardrails(fallback, { themeName })
    ) {
      layout = fallback;
    }
  }

  if (!layout) {
    // Last-resort fallback for difficult themes: allow one fewer placed word.
    const fallback = generateBestLayout(
      themedWords,
      attemptBudget(2200),
      MIN_WORD_TARGET,
      Math.max(6, MIN_PLACED_WORDS - 1),
      { enforceLongIntersections: false, themeName }
    );
    if (
      fallback &&
      layoutPassesThemeGuardrails(fallback, pools.relevanceByAnswer) &&
      layoutPassesLexicalGuardrails(fallback, { themeName })
    ) {
      layout = fallback;
    }
  }

  if (!layout && themedWords !== availableWords) {
    // Hard-theme recovery: try once with the unfiltered pool to avoid empty theme batches.
    const backupTarget = Math.min(12, availableWords.length);
    const backup = generateBestLayout(
      availableWords,
      attemptBudget(2200),
      backupTarget,
      Math.max(6, MIN_PLACED_WORDS - 1),
      { enforceLongIntersections: false, themeName }
    );
    if (
      backup &&
      layoutPassesThemeGuardrails(backup, pools.relevanceByAnswer) &&
      layoutPassesLexicalGuardrails(backup, { themeName })
    ) {
      layout = backup;
    }
  }

  if (!layout && ALLOW_EMERGENCY_FALLBACK) {
    // Emergency fallback for sparse/intersection-poor themes.
    const emergency = generateBestLayout(
      availableWords,
      attemptBudget(2800),
      Math.min(6, availableWords.length),
      Math.min(6, availableWords.length),
      { enforceLongIntersections: false, themeName }
    );
    if (emergency) {
      layout = emergency;
    }
  }
  
  if (!layout) {
      throw new Error(`Could not generate a constrained puzzle for ${themeName}.`);
  }

  const title = themeName;

  const puzzle = layoutToNightcrossing(layout, id, title, themeName);
  
  // Return puzzle and the words that were actually placed
  const usedWords = layout.result.map(w => w.answer.toUpperCase());
  return { puzzle, usedWords };
}

export { THEMES };
