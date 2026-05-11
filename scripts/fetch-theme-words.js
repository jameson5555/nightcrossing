import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { humanizeClue } from './humanizeClue.js';
import { isWordEntryAcceptable } from './clueQuality.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const THEMES_FILE = path.join(__dirname, 'themes.json');
const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';

// How many existing words to use as additional seeds per theme
const EXTRA_SEEDS_PER_THEME = 24;
const MAX_NEW_WORDS_PER_THEME = 160;
const MAX_WIKIPEDIA_WORDS_PER_THEME = 48;
const DATAMUSE_CLUE_CACHE = new Map();

// Datamuse API endpoints that return different kinds of related words
const DATAMUSE_STRATEGIES = [
  {
    name: 'ml',
    baseScore: 1.0,
    rankWeight: 1.0,
    maxCandidates: 120,
    keepTop: 60,
    minThemeScore: 1.0,
    maxAddsPerTheme: 72,
    buildUrl: (kw, max) => `https://api.datamuse.com/words?ml=${encodeURIComponent(kw)}&md=d&max=${max}`
  }, // meaning-like
  {
    name: 'rel_trg',
    baseScore: 0.45,
    rankWeight: 0.45,
    maxCandidates: 100,
    keepTop: 26,
    minThemeScore: 1.2,
    maxAddsPerTheme: 14,
    buildUrl: (kw, max) => `https://api.datamuse.com/words?rel_trg=${encodeURIComponent(kw)}&md=d&max=${max}`
  }, // statistically triggered/associated
  {
    name: 'rel_spc',
    baseScore: 0.75,
    rankWeight: 0.8,
    maxCandidates: 80,
    keepTop: 36,
    minThemeScore: 1.1,
    maxAddsPerTheme: 38,
    buildUrl: (kw, max) => `https://api.datamuse.com/words?rel_spc=${encodeURIComponent(kw)}&md=d&max=${max}`
  }, // hyponyms (more specific than)
  {
    name: 'rel_jjb',
    baseScore: 0.8,
    rankWeight: 0.75,
    maxCandidates: 90,
    keepTop: 34,
    minThemeScore: 1.08,
    maxAddsPerTheme: 28,
    buildUrl: (kw, max) => `https://api.datamuse.com/words?rel_jjb=${encodeURIComponent(kw)}&md=d&max=${max}`
  }, // nouns often described by this adjective
  {
    name: 'rel_jja',
    baseScore: 0.7,
    rankWeight: 0.65,
    maxCandidates: 90,
    keepTop: 30,
    minThemeScore: 1.08,
    maxAddsPerTheme: 24,
    buildUrl: (kw, max) => `https://api.datamuse.com/words?rel_jja=${encodeURIComponent(kw)}&md=d&max=${max}`
  }, // adjectives used to describe this noun
];

const MIN_THEME_RELEVANCE = Number.isFinite(Number(process.env.NC_MIN_THEME_RELEVANCE_FETCH))
  ? Math.max(0.6, Math.min(1.8, Number(process.env.NC_MIN_THEME_RELEVANCE_FETCH)))
  : 1.05;
const MIN_THEME_RELEVANCE_WIKIPEDIA = Number.isFinite(Number(process.env.NC_MIN_THEME_RELEVANCE_WIKI_FETCH))
  ? Math.max(0.7, Math.min(2, Number(process.env.NC_MIN_THEME_RELEVANCE_WIKI_FETCH)))
  : 1.2;
const MIN_CLUE_ACCESSIBILITY = Number.isFinite(Number(process.env.NC_MIN_CLUE_ACCESSIBILITY))
  ? Math.max(0.2, Math.min(1, Number(process.env.NC_MIN_CLUE_ACCESSIBILITY)))
  : 0.58;
const MAX_ANSWER_LENGTH_FOR_EASY_POOL = Number.isFinite(Number(process.env.NC_MAX_ANSWER_LENGTH_FOR_EASY_POOL))
  ? Math.max(8, Math.min(15, Number(process.env.NC_MAX_ANSWER_LENGTH_FOR_EASY_POOL)))
  : 11;
const MAX_RARE_LETTER_RATIO = Number.isFinite(Number(process.env.NC_MAX_RARE_LETTER_RATIO))
  ? Math.max(0.15, Math.min(0.8, Number(process.env.NC_MAX_RARE_LETTER_RATIO)))
  : 0.34;

const WIKIPEDIA_THEME_CATEGORIES = {
  'space astronomy': ['Astronomy', 'Planets', 'Stars', 'Galaxies'],
  'food cooking': ['Foods', 'Cooking techniques', 'Herbs and spices', 'Cooking utensils'],
  'ocean marine life': ['Marine life', 'Oceans', 'Seas', 'Fish'],
  'music sound': ['Musical terminology', 'Musical instruments', 'Music genres', 'Acoustics'],
  'nature wilderness': ['Forests', 'Mountains', 'Rivers', 'Habitats'],
  'technology computing': ['Computer science', 'Software', 'Computing', 'Technology'],
  'history civilization': ['History', 'Ancient history', 'Civilizations', 'Empires'],
  'sports athletics': ['Sports terminology', 'Athletics (track and field)', 'Team sports', 'Ball games']
};

const TITLE_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'over', 'under', 'about', 'between',
  'list', 'lists', 'category', 'categories', 'history', 'culture', 'people', 'century',
  'city', 'cities', 'state', 'states', 'country', 'countries', 'region', 'regions'
]);

function tokenize(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 3);
}

function normalizedThemeKey(themeName) {
  return (themeName || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function getThemeSignals(themeName) {
  const signals = {
    'space astronomy': ['orbit', 'star', 'planet', 'moon', 'solar', 'lunar', 'cosmic', 'galaxy', 'rocket', 'saturn', 'venus', 'mars', 'pluto', 'nebula', 'astro'],
    'food cooking': ['cook', 'bake', 'fry', 'grill', 'dish', 'meal', 'spice', 'kitchen', 'chef', 'recipe', 'broth', 'sauce'],
    'ocean marine life': ['ocean', 'sea', 'tide', 'reef', 'fish', 'whale', 'shark', 'coral', 'marine', 'kelp', 'naut', 'sail'],
    'music sound': ['music', 'song', 'note', 'tune', 'rhythm', 'melody', 'chord', 'tempo', 'audio', 'sound', 'drum', 'piano', 'guitar'],
    'nature wilderness': ['forest', 'river', 'mountain', 'wild', 'tree', 'leaf', 'fauna', 'flora', 'trail', 'meadow', 'canyon', 'nature'],
    'technology computing': ['code', 'data', 'chip', 'byte', 'logic', 'cloud', 'server', 'network', 'ai', 'robot', 'device', 'software'],
    'history civilization': ['ancient', 'empire', 'dynasty', 'historic', 'era', 'civil', 'rome', 'greek', 'medieval', 'war', 'treaty'],
    'sports athletics': ['sport', 'team', 'score', 'goal', 'match', 'coach', 'league', 'athlete', 'race', 'medal', 'tournament']
  };

  return signals[normalizedThemeKey(themeName)] || [];
}

function scoreSeedStrength(themeName, wordEntry) {
  const answer = (wordEntry?.answer || '').toLowerCase();
  const clue = (wordEntry?.clue || '').toLowerCase();
  const hint = (wordEntry?.hint || '').toLowerCase();
  const themeTokens = tokenize(themeName);
  const tokenSet = new Set(themeTokens);

  let score = 0;
  const baseThemeScore = typeof wordEntry?.themeScore === 'number' ? wordEntry.themeScore : 0;
  score += baseThemeScore * 0.7;

  const answerTokens = tokenize(answer);
  const clueTokens = tokenize(clue);
  score += answerTokens.filter(token => tokenSet.has(token)).length * 0.5;
  score += clueTokens.filter(token => tokenSet.has(token)).length * 0.2;

  const signals = getThemeSignals(themeName);
  const combined = `${answer} ${clue} ${hint}`;
  if (signals.some(signal => combined.includes(signal))) score += 0.6;

  if (answer.length >= 4 && answer.length <= 8) score += 0.35;
  if (answer.length >= 9 && answer.length <= 11) score += 0.15;

  return score;
}

function scoreThemeRelevance(themeName, candidateWord, clueText, hintText, sourceBaseScore) {
  const themeTokens = tokenize(themeName);
  const candidateTokens = tokenize(candidateWord);
  const clueTokens = tokenize(clueText);
  const hintTokens = tokenize(hintText);

  const themeTokenSet = new Set(themeTokens);

  let score = sourceBaseScore;

  const candidateOverlap = candidateTokens.filter(token => themeTokenSet.has(token)).length;
  const clueOverlap = clueTokens.filter(token => themeTokenSet.has(token)).length;
  const hintOverlap = hintTokens.filter(token => themeTokenSet.has(token)).length;

  score += Math.min(0.6, candidateOverlap * 0.35);
  score += Math.min(0.5, clueOverlap * 0.15);
  score += Math.min(0.35, hintOverlap * 0.1);

  // Preserve moderately related words while rejecting clear low-signal noise.
  if (themeTokens.length > 0 && candidateOverlap === 0 && clueOverlap === 0 && hintOverlap === 0) {
    score -= 0.2;
  }

  const combined = `${candidateWord || ''} ${clueText || ''} ${hintText || ''}`.toLowerCase();
  const signals = getThemeSignals(themeName);
  if (signals.some(signal => combined.includes(signal))) {
    score += 0.28;
  }

  return Math.max(0, Math.min(2, Number(score.toFixed(3))));
}

function rankAdjustedSourceScore(rankIndex, rankWeight) {
  // Reward top-ranked API responses while still allowing mid-rank variety.
  if (rankIndex < 6) return 0.35 * rankWeight;
  if (rankIndex < 15) return 0.22 * rankWeight;
  if (rankIndex < 30) return 0.1 * rankWeight;
  return 0;
}

function parseDatamuseDefinitions(defs = []) {
  if (!Array.isArray(defs) || defs.length === 0) return null;

  const rawDef = defs[0];
  const parts = String(rawDef).split('\t');
  let cleanDef = parts.length > 1 ? parts[1].trim() : parts[0].trim();
  cleanDef = cleanDef.replace(/^\([^)]+\)\s*/, '');
  if (!cleanDef) return null;

  const clueText = humanizeClue(cleanDef.charAt(0).toUpperCase() + cleanDef.slice(1));

  let hint = null;
  if (defs.length > 1) {
    const hintParts = String(defs[1]).split('\t');
    const cleanHint = hintParts.length > 1 ? hintParts[1].trim() : hintParts[0].trim();
    if (cleanHint) hint = humanizeClue(cleanHint);
  }

  return { clueText, hint };
}

function scoreClueAccessibility(clueText, hintText) {
  const clue = String(clueText || '');
  const hint = String(hintText || '');
  if (!clue) return 0;

  let score = 1;
  const clueWordCount = clue.trim().split(/\s+/).filter(Boolean).length;
  const hintWordCount = hint.trim().split(/\s+/).filter(Boolean).length;

  if (clue.length > 78) score -= 0.16;
  if (clue.length > 95) score -= 0.14;
  if (clueWordCount > 13) score -= 0.14;
  if (clueWordCount > 18) score -= 0.1;
  if (hintWordCount > 14) score -= 0.06;
  if (/[;:]/.test(clue)) score -= 0.12;
  if (/\([^)]*\)/.test(clue)) score -= 0.09;
  if (/[,].*[,]/.test(clue)) score -= 0.08;
  if (/\b(archaic|obsolete|literary|mythological|formal|technical)\b/i.test(clue)) score -= 0.12;

  return Math.max(0, Math.min(1, Number(score.toFixed(3))));
}

function hasHardLetterProfile(answer) {
  const upper = String(answer || '').toUpperCase();
  if (!upper) return false;
  const rareMatches = upper.match(/[JQXZVK]/g);
  const rareCount = rareMatches ? rareMatches.length : 0;
  const rareRatio = rareCount / upper.length;
  return rareRatio > MAX_RARE_LETTER_RATIO;
}

async function fetchDatamuseClueForWord(wordLower) {
  if (DATAMUSE_CLUE_CACHE.has(wordLower)) {
    return DATAMUSE_CLUE_CACHE.get(wordLower);
  }

  try {
    const url = `https://api.datamuse.com/words?sp=${encodeURIComponent(wordLower)}&md=d&max=8`;
    const res = await fetch(url);
    const data = await res.json();
    const exact = data.find(item => String(item.word || '').toLowerCase() === wordLower) || data[0];
    const parsed = exact ? parseDatamuseDefinitions(exact.defs || []) : null;
    DATAMUSE_CLUE_CACHE.set(wordLower, parsed);
    return parsed;
  } catch {
    DATAMUSE_CLUE_CACHE.set(wordLower, null);
    return null;
  }
}

// Rate-limit helper: wait between API calls to be a good citizen
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function categoryToTitle(categoryName) {
  return `Category:${categoryName.replace(/\s+/g, '_')}`;
}

function extractWordCandidatesFromTitle(title) {
  const normalizedTitle = (title || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^A-Za-z\s]/g, ' ')
    .toLowerCase();

  const tokens = normalizedTitle
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length >= 3 && token.length <= 12)
    .filter(token => !TITLE_STOPWORDS.has(token));

  return [...new Set(tokens)]
    .filter(token => isValidCrosswordWord(token));
}

async function fetchWikipediaCategoryWords(themeName) {
  const categories = WIKIPEDIA_THEME_CATEGORIES[normalizedThemeKey(themeName)] || [];
  if (categories.length === 0) return [];

  const scored = new Map();

  for (const categoryName of categories) {
    let continueToken = null;
    let pageBatches = 0;

    while (pageBatches < 2) {
      const params = new URLSearchParams({
        action: 'query',
        list: 'categorymembers',
        cmtitle: categoryToTitle(categoryName),
        cmtype: 'page',
        cmlimit: '150',
        format: 'json'
      });

      if (continueToken) params.set('cmcontinue', continueToken);

      const res = await fetch(`${WIKIPEDIA_API}?${params.toString()}`);
      const json = await res.json();
      const members = json?.query?.categorymembers || [];

      for (const member of members) {
        const words = extractWordCandidatesFromTitle(member?.title || '');
        for (const candidateWord of words) {
          scored.set(candidateWord, (scored.get(candidateWord) || 0) + 1);
        }
      }

      continueToken = json?.continue?.cmcontinue || null;
      pageBatches += 1;
      if (!continueToken) break;
      await sleep(80);
    }
  }

  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 200)
    .map(([word, occurrences]) => ({
      word,
      occurrences
    }));
}

/**
 * Pick seed words from the existing theme pool.
 * Prioritizes short, core theme words (3-8 letters) that make good query seeds.
 * Shuffles to get variety on each monthly run.
 */
function pickSeeds(themeWords, themeName) {
  // Start with the theme name keywords
  const nameKeywords = themeName
    .split(/\s*&\s*/)
    .map(k => k.trim().toLowerCase())
    .filter(k => k.length >= 3);

  // Pick existing words as seeds: short-to-medium, single-word answers only
  const candidates = themeWords
    .map(w => ({
      answer: (w.answer || '').toLowerCase(),
      strength: scoreSeedStrength(themeName, w)
    }))
    .filter(w => w.answer.length >= 3 && w.answer.length <= 10 && !w.answer.includes(' ') && !w.answer.includes('-'));

  // Shuffle deterministically based on current month so we get fresh seeds each run
  const now = new Date();
  const monthSeed = now.getFullYear() * 12 + now.getMonth();
  const shuffled = candidates
    .map((item, i) => ({
      item,
      sort: (item.strength * 0.8) + Math.sin(i * 9301 + monthSeed * 49297)
    }))
    .sort((a, b) => b.sort - a.sort)
    .map(x => x.item.answer);

  // Take top N that aren't already in the name keywords
  const extras = shuffled
    .filter(w => !nameKeywords.includes(w))
    .slice(0, EXTRA_SEEDS_PER_THEME);

  return [...nameKeywords, ...extras];
}

/**
 * Validate that a word is suitable for crossword puzzles.
 */
function isValidCrosswordWord(word) {
  if (word.includes(' ') || word.includes('-') || word.includes("'")) return false;
  if (word.length < 3 || word.length > 15) return false;
  if (!/^[a-zA-Z]+$/.test(word)) return false;
  return true;
}

export async function fetchThemeWords() {
  console.log('Fetching new words for themes...\n');

  if (!fs.existsSync(THEMES_FILE)) {
    console.error('themes.json not found!');
    process.exit(1);
  }

  const themes = JSON.parse(fs.readFileSync(THEMES_FILE, 'utf8'));
  let totalUpdated = 0;

  for (let i = 0; i < themes.length; i++) {
    const theme = themes[i];
    const existingAnswers = new Set(theme.words.map(w => w.answer.toUpperCase()));
    const seeds = pickSeeds(theme.words, theme.name);
    let added = 0;
    const addedByStrategy = new Map(DATAMUSE_STRATEGIES.map(strategy => [strategy.name, 0]));

    console.log(`\n━━━ ${theme.name} ━━━`);
    console.log(`  Pool: ${theme.words.length} words | Seeds: ${seeds.slice(0, 5).join(', ')}... (${seeds.length} total)`);

    // Add cleaner semantic candidates from curated Wikipedia categories first.
    try {
      const wikiCandidates = await fetchWikipediaCategoryWords(theme.name);
      let wikiAdded = 0;

      for (const candidate of wikiCandidates) {
        if (added >= MAX_NEW_WORDS_PER_THEME) break;
        if (wikiAdded >= MAX_WIKIPEDIA_WORDS_PER_THEME) break;

        const word = candidate.word.toUpperCase();
        if (word.length > MAX_ANSWER_LENGTH_FOR_EASY_POOL) continue;
        if (hasHardLetterProfile(word)) continue;
        if (existingAnswers.has(word)) continue;

        const clueData = await fetchDatamuseClueForWord(candidate.word);
        if (!clueData) continue;

        const clueText = clueData.clueText;
        const hint = clueData.hint;

        const themeScore = scoreThemeRelevance(
          theme.name,
          candidate.word,
          clueText,
          hint,
          1.15
        ) + Math.min(0.18, candidate.occurrences * 0.04);
        const clueAccessibility = scoreClueAccessibility(clueText, hint);

        if (clueAccessibility < MIN_CLUE_ACCESSIBILITY) continue;

        if (themeScore < MIN_THEME_RELEVANCE_WIKIPEDIA) continue;

        const candidateEntry = {
          answer: word,
          clue: clueText,
          hint
        };

        const qualityCheck = isWordEntryAcceptable(candidateEntry);
        if (!qualityCheck.ok) continue;

        theme.words.push({
          answer: word,
          clue: clueText,
          hint,
          source: 'wikipedia-category',
          themeScore: Number((themeScore + clueAccessibility * 0.08).toFixed(3))
        });
        existingAnswers.add(word);
        added++;
        wikiAdded++;
        totalUpdated++;
      }

      if (wikiAdded > 0) {
        console.log(`  Added ${wikiAdded} from Wikipedia categories`);
      }
    } catch {
      // Continue with Datamuse if Wikipedia API is unavailable.
    }

    for (const seed of seeds) {
      if (added >= MAX_NEW_WORDS_PER_THEME) break;

      for (const strategy of DATAMUSE_STRATEGIES) {
        if (added >= MAX_NEW_WORDS_PER_THEME) break;
        if ((addedByStrategy.get(strategy.name) || 0) >= strategy.maxAddsPerTheme) continue;

        const url = strategy.buildUrl(seed, strategy.maxCandidates);
        try {
          const res = await fetch(url);
          const data = await res.json();
          const rankedData = [...data]
            .sort((a, b) => (b.score || 0) - (a.score || 0))
            .slice(0, strategy.keepTop);

          for (let rankIndex = 0; rankIndex < rankedData.length; rankIndex++) {
            const d = rankedData[rankIndex];
            const word = d.word.toUpperCase();

            if (!isValidCrosswordWord(d.word)) continue;
            if (word.length > MAX_ANSWER_LENGTH_FOR_EASY_POOL) continue;
            if (hasHardLetterProfile(word)) continue;
            if (existingAnswers.has(word)) continue;

            if (d.defs && d.defs.length > 0) {
              const parsedDefs = parseDatamuseDefinitions(d.defs);
              if (!parsedDefs) continue;

              const clueText = parsedDefs.clueText;
              const hint = parsedDefs.hint;

              const themeScore = scoreThemeRelevance(
                theme.name,
                d.word,
                clueText,
                hint,
                strategy.baseScore
              ) + rankAdjustedSourceScore(rankIndex, strategy.rankWeight);
              const clueAccessibility = scoreClueAccessibility(clueText, hint);
              const effectiveMinThemeScore = Math.max(MIN_THEME_RELEVANCE, strategy.minThemeScore || 0);

              if (themeScore < effectiveMinThemeScore) continue;
              if (clueAccessibility < MIN_CLUE_ACCESSIBILITY) continue;

              const candidate = {
                answer: word,
                clue: clueText,
                hint: hint
              };

              const qualityCheck = isWordEntryAcceptable(candidate);
              if (!qualityCheck.ok) continue;

              theme.words.push({
                answer: word,
                clue: clueText,
                hint: hint,
                source: strategy.name,
                themeScore: Number((themeScore + clueAccessibility * 0.08).toFixed(3))
              });
              existingAnswers.add(word);
              added++;
              addedByStrategy.set(strategy.name, (addedByStrategy.get(strategy.name) || 0) + 1);
              totalUpdated++;

              if (added >= MAX_NEW_WORDS_PER_THEME) break;
            }
          }
        } catch {
          // Silently continue on network errors for individual queries
        }

        // Be polite to the API
        await sleep(100);
      }
    }

    console.log(`  Added ${added} new words → pool now: ${theme.words.length}`);
  }

  if (totalUpdated > 0) {
    fs.writeFileSync(THEMES_FILE, JSON.stringify(themes, null, 2));
    console.log(`\n✅ Success: Added ${totalUpdated} new words across all themes.`);
  } else {
    console.log('\nNo new words added.');
  }
}

const isDirectRun = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isDirectRun) {
  fetchThemeWords();
}
