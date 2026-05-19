import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import WordPOS from 'wordpos';
import { humanizeClue } from './humanizeClue.js';
import { isWordEntryAcceptable } from './clueQuality.js';
import { annotateWordEntry } from './lexicalDifficulty.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const THEMES_FILE = path.join(__dirname, 'themes.json');
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
const WIKTIONARY_DEFINITION_API = 'https://en.wiktionary.org/api/rest_v1/page/definition/';

// How many existing words to use as additional seeds per theme
const EXTRA_SEEDS_PER_THEME = 24;
const MAX_NEW_WORDS_PER_THEME = 160;
const MAX_WIKIDATA_WORDS_PER_THEME = 18;
const MAX_WIKIDATA_SEEDS_PER_THEME = 10;
const MAX_WIKIDATA_RESULTS_PER_SEED = 10;
const MAX_WIKIPEDIA_WORDS_PER_THEME = 48;
const MAX_WORDNET_WORDS_PER_THEME = 20;
const MAX_WORDNET_CANDIDATES_PER_SEED = 8;
const MAX_WIKIPEDIA_SUBCATEGORY_DEPTH = Number.isFinite(Number(process.env.NC_MAX_WIKIPEDIA_SUBCATEGORY_DEPTH))
  ? Math.max(0, Math.min(2, Number(process.env.NC_MAX_WIKIPEDIA_SUBCATEGORY_DEPTH)))
  : 1;
const MAX_WIKIPEDIA_SUBCATEGORIES_PER_THEME = Number.isFinite(Number(process.env.NC_MAX_WIKIPEDIA_SUBCATEGORIES_PER_THEME))
  ? Math.max(4, Math.min(40, Number(process.env.NC_MAX_WIKIPEDIA_SUBCATEGORIES_PER_THEME)))
  : 16;
const MAX_WIKIPEDIA_PAGE_BATCHES_PER_CATEGORY = 2;
const MAX_WIKIPEDIA_SUBCATEGORY_BATCHES = 1;
const DATAMUSE_CLUE_CACHE = new Map();
const WIKIDATA_SEARCH_CACHE = new Map();
const WORDNET_DEFINITION_CACHE = new Map();
const WORDNET_RELATED_CACHE = new Map();
const WIKTIONARY_DEFINITION_CACHE = new Map();
const EXACT_DEFINITION_CACHE = new Map();
const REQUEST_HEADERS = {
  'user-agent': 'nightcrossing-source-enrichment/1.0'
};
const WIKIPEDIA_MAX_RETRIES = 3;
const WORDNET_LOOKUP_POS_PRIORITY = new Map([
  ['n', 0],
  ['a', 1],
  ['s', 1],
  ['v', 2],
  ['r', 3]
]);
const wordpos = new WordPOS();

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
const ENABLE_MODERATE_PROPER_NOUN_FILTER = process.env.NC_ENABLE_MODERATE_PROPER_NOUN_FILTER !== '0';
const ENABLE_WIKIDATA_SOURCE = process.env.NC_ENABLE_WIKIDATA_SOURCE === '1';
const ENABLE_WIKIPEDIA_SOURCE = process.env.NC_ENABLE_WIKIPEDIA_SOURCE !== '0';
const ENABLE_WORDNET_SOURCE = process.env.NC_ENABLE_WORDNET_SOURCE !== '0';
const ENABLE_WORDNET_SYNONYMS = process.env.NC_ENABLE_WORDNET_SYNONYMS === '1';
const ENABLE_DATAMUSE_SOURCE = process.env.NC_ENABLE_DATAMUSE_SOURCE !== '0';
const ENABLE_DATAMUSE_EXPANSION = process.env.NC_ENABLE_DATAMUSE_EXPANSION !== '0';
const ENABLE_WIKTIONARY_SOURCE = process.env.NC_ENABLE_WIKTIONARY_SOURCE !== '0';
const THEME_FILTER_KEYS = new Set(
  String(process.env.NC_THEME_FILTER || '')
    .split(',')
    .map(themeName => normalizedThemeKey(themeName))
    .filter(Boolean)
);

const WIKIPEDIA_THEME_CATEGORIES = {
  'space astronomy': ['Astronomy', 'Astronomical objects', 'Planets', 'Stars', 'Galaxies', 'Spaceflight', 'Orbits', 'Telescopes'],
  'food cooking': ['Foods', 'Cooking techniques', 'Herbs and spices', 'Cooking utensils', 'Dishes', 'Baking', 'Culinary terminology'],
  'ocean marine life': ['Marine life', 'Oceanography', 'Oceans', 'Seas', 'Fish', 'Marine biology', 'Nautical terminology'],
  'music sound': ['Musical terminology', 'Musical instruments', 'Music genres', 'Acoustics', 'Audio engineering', 'Music theory'],
  'weather climate': ['Meteorology', 'Weather', 'Climate', 'Atmosphere', 'Clouds', 'Storms', 'Precipitation', 'Seasons'],
  'plants gardens': ['Plants', 'Botany', 'Horticulture', 'Garden plants', 'Trees', 'Flowers', 'Herbs', 'Gardening'],
  'internet software': ['Software', 'Computing', 'Internet terminology', 'Computer networking', 'Databases', 'Web browsers', 'Web applications', 'Algorithms'],
  'sports athletics': ['Sports terminology', 'Athletics (track and field)', 'Team sports', 'Ball games', 'Sport of athletics', 'Sporting equipment']
};

const WIKIPEDIA_GENERIC_PAGE_TITLE_REGEX = /\b(award|awards|prize|prizes|medal|medals|winner|winners|list|lists|outline|outlines|timeline|timelines|glossary|glossaries|people|births|deaths|company|companies|organization|organizations|association|associations|journal|journals|magazine|magazines|website|websites|film|films|song|songs|album|albums|television|fictional|characters?)\b/i;
const WIKIPEDIA_GENERIC_SUBCATEGORY_REGEX = /\b(award|awards|prize|prizes|medal|medals|winner|winners|people|births|deaths|company|companies|organization|organizations|association|associations|university|universities|school|schools|website|websites|journal|journals|magazine|magazines|film|films|song|songs|album|albums|television|fictional|characters?|by\s+(country|year|decade|century)|stubs?)\b/i;
const WIKIPEDIA_CANDIDATE_BLOCKLIST = new Set([
  'award', 'awards', 'prize', 'prizes', 'medal', 'medals', 'winner', 'winners',
  'outline', 'outlines', 'timeline', 'timelines', 'glossary', 'glossaries',
  'people', 'person', 'company', 'companies', 'organization', 'organizations',
  'association', 'associations', 'journal', 'journals', 'magazine', 'magazines',
  'website', 'websites', 'study', 'studies', 'culture', 'history', 'committee',
  'committees', 'school', 'schools', 'university', 'universities'
]);
const WIKIDATA_GENERIC_DESCRIPTION_REGEX = /\b(journal|magazine|newspaper|record\s+label|television|tv\s+series|video\s+game|film|album|song|episode|season|franchise|baseball\s+team|sports\s+club|company|organization|fictional|Wikimedia|disambiguation|scientific\s+journal|american\s+magazine|reality\s+show|band|music\s+band|musical\s+group|singer|actor|actress|at\s+the\s+\d{4}\s+summer\s+olympics)\b/i;

const THEME_PROPER_NOUN_ALLOWLIST = {
  'space astronomy': new Set([
    'MARS', 'VENUS', 'EARTH', 'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO',
    'MOON', 'SUN', 'STAR', 'ORBIT', 'GALAXY', 'TITAN', 'EUROPA', 'ASTEROID',
    'COMET', 'NEBULA'
  ])
};

const OBSCURE_PROPER_NOUN_SIGNAL_REGEX = /\b(goddess|god|deity|mythological|myth|constellation|kuiper|planetoid|primordial|trojan|tau\s+[a-z]+|mistress\s+of\s+zeus|one\s+of\s+the\s+moons\s+of\s+jupiter|one\s+of\s+the\s+moons\s+of\s+saturn|roman\s+deity|greek\s+deity)\b/i;
const ASTRONOMY_NICHE_NAME_REGEX = /\b(aoede|elara|amalthea|hygiea|tau\s+[a-z]+|pegasi|ursa\s+major|capricorni|salacia|uranian)\b/i;

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
  const normalized = (themeName || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (normalized === 'space sky') return 'space astronomy';
  return normalized;
}

function getThemeSignals(themeName) {
  const signals = {
    'space astronomy': ['orbit', 'star', 'planet', 'moon', 'solar', 'lunar', 'cosmic', 'galaxy', 'rocket', 'saturn', 'venus', 'mars', 'pluto', 'nebula', 'astro'],
    'food cooking': ['cook', 'bake', 'fry', 'grill', 'dish', 'meal', 'spice', 'kitchen', 'chef', 'recipe', 'broth', 'sauce'],
    'ocean marine life': ['ocean', 'sea', 'tide', 'reef', 'fish', 'whale', 'shark', 'coral', 'marine', 'kelp', 'naut', 'sail'],
    'music sound': ['music', 'song', 'note', 'tune', 'rhythm', 'melody', 'chord', 'tempo', 'audio', 'sound', 'drum', 'piano', 'guitar'],
    'weather climate': ['weather', 'climate', 'storm', 'rain', 'wind', 'cloud', 'snow', 'sun', 'solar', 'sky', 'forecast', 'season', 'breeze', 'gale', 'frost', 'thunder', 'lightning', 'atmos', 'meteor'],
    'plants gardens': ['plant', 'garden', 'leaf', 'tree', 'flower', 'bloom', 'seed', 'stem', 'root', 'fern', 'moss', 'shrub', 'vine', 'petal', 'orchid', 'cactus', 'pollen', 'flora', 'herb', 'botan'],
    'internet software': ['internet', 'web', 'browser', 'server', 'cloud', 'code', 'coding', 'program', 'software', 'query', 'cache', 'file', 'files', 'sync', 'network', 'node', 'nodes', 'protocol', 'database', 'cyber', 'byte', 'chip', 'cpu', 'hash', 'api', 'online', 'digital'],
    'sports athletics': ['sport', 'team', 'score', 'goal', 'match', 'coach', 'league', 'athlete', 'race', 'medal', 'tournament']
  };

  return signals[normalizedThemeKey(themeName)] || [];
}

function isRelevantWikipediaSubcategory(themeName, categoryTitle) {
  return scoreWikipediaSubcategory(themeName, categoryTitle) >= 1.05;
}

function scoreWikipediaSubcategory(themeName, categoryTitle) {
  const title = stripCategoryPrefix(categoryTitle).toLowerCase();
  if (!title) return 0;
  if (WIKIPEDIA_GENERIC_SUBCATEGORY_REGEX.test(title)) return 0;

  const themeTokens = tokenize(themeName);
  const titleTokens = tokenize(title);
  const titleCandidates = extractWordCandidatesFromTitle(title);
  const signals = getThemeSignals(themeName);

  let score = 0;
  score += titleTokens.filter(token => themeTokens.includes(token)).length * 1.15;
  score += signals.filter(signal => signal.length >= 3 && title.includes(signal)).length * 1.35;
  score += titleCandidates.filter(candidate => signals.some(signal => signal.length >= 3 && (candidate.includes(signal) || signal.includes(candidate)))).length * 0.7;
  if (/\b(terms?|terminology|concepts?|objects?|techniques?|instruments?|theory|architecture|networks?|databases?|spaceflight|orbits?|telescopes?|ecology|wildlife)\b/i.test(title)) {
    score += 0.35;
  }

  return Number(score.toFixed(3));
}

function isRelevantWikipediaCandidateWord(themeName, candidateWord, depth = 0, pageTitle = '', categoryName = '') {
  const normalizedCandidate = String(candidateWord || '').toLowerCase();
  if (!normalizedCandidate) return false;
  if (WIKIPEDIA_CANDIDATE_BLOCKLIST.has(normalizedCandidate)) return false;
  if (normalizedCandidate.length <= 4 && !/[aeiouy]/.test(normalizedCandidate)) return false;
  if (/^(ngc|ugc|sdss|messier|acm|api|cpu|gpu|ram|rom)$/i.test(normalizedCandidate)) return false;

  const sourceBaseScore = depth === 0 ? 0.48 : 0.38;
  const contextText = `${pageTitle || ''} ${categoryName || ''}`.trim();
  const score = scoreThemeRelevance(themeName, candidateWord, contextText, categoryName, sourceBaseScore);
  const combined = `${normalizedCandidate} ${contextText}`.toLowerCase();
  const signalHits = getThemeSignals(themeName).filter(signal => signal.length >= 3 && combined.includes(signal)).length;
  const minimumScore = signalHits > 0
    ? (depth === 0 ? 0.56 : 0.6)
    : (depth === 0 ? 0.72 : 0.82);

  return score >= minimumScore;
}

function isRelevantWikidataCandidateWord(themeName, candidateWord, label = '', description = '', aliases = []) {
  const normalizedCandidate = String(candidateWord || '').toLowerCase();
  if (!normalizedCandidate) return false;
  if (WIKIPEDIA_CANDIDATE_BLOCKLIST.has(normalizedCandidate)) return false;
  if (normalizedCandidate.length <= 4 && !/[aeiouy]/.test(normalizedCandidate)) return false;
  if (WIKIDATA_GENERIC_DESCRIPTION_REGEX.test(String(description || ''))) return false;

  const contextText = [label, description, ...(Array.isArray(aliases) ? aliases.slice(0, 3) : [])]
    .filter(Boolean)
    .join(' ');
  const score = scoreThemeRelevance(themeName, candidateWord, contextText, description, 0.72);
  const combined = `${normalizedCandidate} ${contextText}`.toLowerCase();
  const signalHits = getThemeSignals(themeName).filter(signal => signal.length >= 3 && combined.includes(signal)).length;
  const minimumScore = signalHits > 0 ? 0.76 : 0.96;

  return score >= minimumScore;
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

function hasLexicalThemeAnchor(themeName, wordEntry) {
  const answer = (wordEntry?.answer || '').toLowerCase();
  const clue = (wordEntry?.clue || '').toLowerCase();
  const hint = (wordEntry?.hint || '').toLowerCase();
  const combined = `${answer} ${clue} ${hint}`.trim();
  if (!combined) return false;

  const themeTokens = tokenize(themeName);
  const tokenSet = new Set(themeTokens);
  const signals = getThemeSignals(themeName);
  const tokens = [
    ...tokenize(answer),
    ...tokenize(clue),
    ...tokenize(hint)
  ];

  const tokenOverlap = tokens.filter(token => tokenSet.has(token)).length;
  const signalHits = signals.filter(signal => signal.length >= 3 && combined.includes(signal)).length;
  return tokenOverlap > 0 || signalHits > 0;
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

function normalizeForComparison(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function contentTokens(str) {
  return (str || '')
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.filter(token => token.length >= 3) || [];
}

function looksLikeClueEcho(candidateHint, clueText) {
  const hintNorm = normalizeForComparison(candidateHint);
  const clueNorm = normalizeForComparison(clueText);
  if (!hintNorm || !clueNorm) return false;
  if (hintNorm === clueNorm) return true;

  if (hintNorm.length >= 12 && clueNorm.length >= 12) {
    if (hintNorm.includes(clueNorm) || clueNorm.includes(hintNorm)) return true;
  }

  const clueSet = new Set(contentTokens(clueText));
  const hintTokens = contentTokens(candidateHint);
  if (hintTokens.length > 0) {
    const overlap = hintTokens.filter(token => clueSet.has(token)).length;
    if (overlap >= 3 && overlap / hintTokens.length >= 0.7) return true;
  }

  return false;
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
    return true;
  }

  return false;
}

function isThemeAnchorAllowed(themeName, answerUpper) {
  const allowlist = THEME_PROPER_NOUN_ALLOWLIST[normalizedThemeKey(themeName)];
  return Boolean(allowlist?.has(answerUpper));
}

function isLikelyObscureProperNoun(themeName, answerUpper, clueText, hintText) {
  if (!ENABLE_MODERATE_PROPER_NOUN_FILTER) return false;
  if (isThemeAnchorAllowed(themeName, answerUpper)) return false;

  const themeKey = normalizedThemeKey(themeName);
  const clue = String(clueText || '');
  const hint = String(hintText || '');
  const joined = `${clue} ${hint}`.trim();

  let score = 0;
  if (OBSCURE_PROPER_NOUN_SIGNAL_REGEX.test(joined)) score += 2;
  if (hasInnerCapitalizedToken(clue) || hasInnerCapitalizedToken(hint)) score += 1;
  if (/\b(pegasi|uranian|salacia|aoede|elara|callisto|ganymede|amalthea)\b/i.test(joined)) score += 1.5;
  if (themeKey === 'space astronomy') {
    if (ASTRONOMY_NICHE_NAME_REGEX.test(joined) || ASTRONOMY_NICHE_NAME_REGEX.test(answerUpper)) score += 1.6;
    if (/\b(alpha|beta|gamma|delta)\s+[a-z]+\b/i.test(joined)) score += 1.2;
    if (/\b(moon\s+of\s+jupiter|moon\s+of\s+saturn|moon\s+of\s+uranus)\b/i.test(joined)) score += 1.1;
    if (/\b(roman|greek)\s+(goddess|god|deity)\b/i.test(joined)) score += 1.2;
  }

  const threshold = themeKey === 'space astronomy' ? 1.8 : 2;
  return score >= threshold;
}

function buildDefinitionBackstopHint(definitionText, clueText = '', answer = '') {
  const cleaned = String(definitionText || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[.;:!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return null;

  const words = cleaned.split(' ').filter(Boolean);
  if (words.length === 0) return null;

  const clueTokenSet = new Set(contentTokens(clueText));
  const answerTokenSet = new Set(contentTokens(answer));
  const filtered = words.filter(word => {
    const token = word.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!token || token.length < 4) return false;
    if (clueTokenSet.has(token)) return false;
    if (answerTokenSet.has(token)) return false;
    return true;
  });

  if (filtered.length < 2) return null;

  const conceptWords = filtered
    .slice(0, Math.min(6, filtered.length))
    .join(' ');
  if (!conceptWords) return null;

  const hint = `Related concept: ${conceptWords}`;
  if (looksLikeClueEcho(hint, clueText)) return null;

  return hint;
}

function decodeHtmlEntities(text) {
  return String(text || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const normalized = String(entity || '').toLowerCase();
    if (normalized.startsWith('#x')) {
      const value = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(value) ? String.fromCodePoint(value) : match;
    }
    if (normalized.startsWith('#')) {
      const value = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(value) ? String.fromCodePoint(value) : match;
    }

    const namedEntities = {
      amp: '&',
      apos: "'",
      nbsp: ' ',
      quot: '"',
      lt: '<',
      gt: '>',
      ndash: '-',
      mdash: '-',
      rsquo: "'",
      lsquo: "'",
      ldquo: '"',
      rdquo: '"'
    };

    return namedEntities[normalized] || match;
  });
}

  async function fetchJSONOrNull(url) {
    try {
      const res = await fetch(url, { headers: REQUEST_HEADERS });
      if (!res.ok) return null;

      const text = await res.text();
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

async function fetchWikipediaJSONOrNull(url, retries = WIKIPEDIA_MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: REQUEST_HEADERS });
      const text = await res.text();

      if (res.status === 429) {
        if (attempt >= retries) return null;

        const retryAfterHeader = Number(res.headers.get('retry-after'));
        const retryDelay = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
          ? retryAfterHeader * 1000
          : 350 * (attempt + 1) * (attempt + 2);
        await sleep(retryDelay);
        continue;
      }

      if (!res.ok) return null;

      try {
        return JSON.parse(text);
      } catch {
        if (attempt >= retries) return null;
        await sleep(220 * (attempt + 1));
      }
    } catch {
      if (attempt >= retries) return null;
      await sleep(220 * (attempt + 1));
    }
  }

  return null;
}

function normalizeDefinitionText(rawText) {
  const cleaned = decodeHtmlEntities(String(rawText || ''))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/^\([^)]+\)\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[;:,.\-\s]+/, '')
    .replace(/[;:,.\-\s]+$/, '');

  if (!cleaned) return null;
  if (cleaned.length < 6 || cleaned.length > 220) return null;
  return cleaned;
}

function buildDefinitionEntryFromTexts(definitionTexts = [], answerText = '') {
  const cleanDefinitions = [...new Set(
    definitionTexts
      .map(text => normalizeDefinitionText(text))
      .filter(Boolean)
  )];
  if (cleanDefinitions.length === 0) return null;

  const normalizedAnswer = String(answerText || '').trim().toUpperCase();
  let cleanDef = null;
  let clueText = null;

  for (const candidateDefinition of cleanDefinitions) {
    const candidateClue = humanizeClue(candidateDefinition.charAt(0).toUpperCase() + candidateDefinition.slice(1));
    const clueValidation = isWordEntryAcceptable({
      answer: normalizedAnswer,
      clue: candidateClue,
      hint: ''
    });
    if (!clueValidation.ok) continue;

    cleanDef = candidateDefinition;
    clueText = candidateClue;
    break;
  }

  if (!cleanDef || !clueText) return null;

  let hint = null;
  for (const candidateDefinition of cleanDefinitions) {
    if (candidateDefinition === cleanDef) continue;

    const humanizedHint = humanizeClue(candidateDefinition);
    if (!humanizedHint) continue;
    if (looksLikeClueEcho(humanizedHint, clueText)) continue;

    const hintValidation = isWordEntryAcceptable({
      answer: normalizedAnswer,
      clue: clueText,
      hint: humanizedHint
    });
    if (!hintValidation.ok) continue;

    hint = humanizedHint;
    break;
  }

  if (!hint) {
    const fallbackHint = buildDefinitionBackstopHint(cleanDef, clueText, answerText);
    const hintValidation = fallbackHint
      ? isWordEntryAcceptable({
          answer: normalizedAnswer,
          clue: clueText,
          hint: fallbackHint
        })
      : { ok: false };
    if (fallbackHint && !looksLikeClueEcho(fallbackHint, clueText) && hintValidation.ok) {
      hint = fallbackHint;
    }
  }

  return { clueText, hint };
}

function parseDatamuseDefinitions(defs = [], answerText = '') {
  if (!Array.isArray(defs) || defs.length === 0) return null;

  const definitionTexts = defs
    .map(rawDef => {
      const parts = String(rawDef).split('\t');
      return parts.length > 1 ? parts[1].trim() : parts[0].trim();
    });

  return buildDefinitionEntryFromTexts(definitionTexts, answerText);
}

function parseWiktionaryDefinitions(payload, answerText = '') {
  const englishEntries = Array.isArray(payload?.en) ? payload.en : [];
  if (englishEntries.length === 0) return null;

  const preferredPartsOfSpeech = new Set(['noun', 'adjective', 'verb', 'adverb']);
  const orderedEntries = [...englishEntries].sort((a, b) => {
    const aPreferred = preferredPartsOfSpeech.has(String(a?.partOfSpeech || '').toLowerCase()) ? 1 : 0;
    const bPreferred = preferredPartsOfSpeech.has(String(b?.partOfSpeech || '').toLowerCase()) ? 1 : 0;
    return bPreferred - aPreferred;
  });

  const definitionTexts = [];
  for (const entry of orderedEntries) {
    const definitions = Array.isArray(entry?.definitions) ? entry.definitions : [];
    for (const definition of definitions) {
      const cleanDefinition = normalizeDefinitionText(definition?.definition || '');
      if (!cleanDefinition) continue;
      if (/\b(obsolete|archaic|alternative\s+form|alternative\s+spelling|inflection\s+of|plural\s+of)\b/i.test(cleanDefinition)) continue;

      definitionTexts.push(cleanDefinition);
      if (definitionTexts.length >= 6) break;
    }
    if (definitionTexts.length >= 6) break;
  }

  return buildDefinitionEntryFromTexts(definitionTexts, answerText);
}

function sortWordNetLookupResults(lookupResults = []) {
  return [...lookupResults].sort((a, b) => {
    const aPriority = WORDNET_LOOKUP_POS_PRIORITY.get(String(a?.pos || '').toLowerCase()) ?? 99;
    const bPriority = WORDNET_LOOKUP_POS_PRIORITY.get(String(b?.pos || '').toLowerCase()) ?? 99;
    if (aPriority !== bPriority) return aPriority - bPriority;

    const aSynonymCount = Array.isArray(a?.synonyms) ? a.synonyms.length : 0;
    const bSynonymCount = Array.isArray(b?.synonyms) ? b.synonyms.length : 0;
    return bSynonymCount - aSynonymCount;
  });
}

function parseWordNetDefinitions(lookupResults = [], answerText = '') {
  if (!Array.isArray(lookupResults) || lookupResults.length === 0) return null;

  const definitionTexts = [];
  for (const item of sortWordNetLookupResults(lookupResults)) {
    const cleanDefinition = normalizeDefinitionText(item?.def || '');
    if (!cleanDefinition) continue;
    if (/\b(obsolete|archaic|alternative\s+form|alternative\s+spelling|inflection\s+of|plural\s+of)\b/i.test(cleanDefinition)) continue;
    definitionTexts.push(cleanDefinition);
    if (definitionTexts.length >= 6) break;
  }

  return buildDefinitionEntryFromTexts(definitionTexts, answerText);
}

function normalizeWordNetSynonym(rawSynonym) {
  return String(rawSynonym || '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
  if (/\b(goddess|god|deity|constellation|kuiper|planetoid|primordial|trojan)\b/i.test(`${clue} ${hint}`)) score -= 0.16;
  if (/\b(one\s+of\s+the\s+moons\s+of\s+jupiter|mistress\s+of\s+zeus|tau\s+[a-z]+)\b/i.test(`${clue} ${hint}`)) score -= 0.2;

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
    const data = await fetchJSONOrNull(url);
    if (!Array.isArray(data)) {
      DATAMUSE_CLUE_CACHE.set(wordLower, null);
      return null;
    }
    const exact = data.find(item => String(item.word || '').toLowerCase() === wordLower) || data[0];
    const parsedBase = exact ? parseDatamuseDefinitions(exact.defs || [], wordLower) : null;
    const parsed = parsedBase ? { ...parsedBase, source: 'datamuse-exact' } : null;
    DATAMUSE_CLUE_CACHE.set(wordLower, parsed);
    return parsed;
  } catch {
    DATAMUSE_CLUE_CACHE.set(wordLower, null);
    return null;
  }
}

async function fetchWordNetDefinitionForWord(wordLower) {
  if (WORDNET_DEFINITION_CACHE.has(wordLower)) {
    return WORDNET_DEFINITION_CACHE.get(wordLower);
  }

  try {
    const lookupResults = await wordpos.lookup(wordLower);
    const parsedBase = parseWordNetDefinitions(lookupResults, wordLower);
    const parsed = parsedBase ? { ...parsedBase, source: 'wordnet-exact' } : null;
    WORDNET_DEFINITION_CACHE.set(wordLower, parsed);
    return parsed;
  } catch {
    WORDNET_DEFINITION_CACHE.set(wordLower, null);
    return null;
  }
}

async function fetchWordNetRelatedWords(seedWord) {
  const lookupWord = String(seedWord || '').trim().toLowerCase();
  if (!lookupWord) return [];
  if (WORDNET_RELATED_CACHE.has(lookupWord)) {
    return WORDNET_RELATED_CACHE.get(lookupWord);
  }

  try {
    const lookupResults = await wordpos.lookup(lookupWord);
    const preferredResults = sortWordNetLookupResults(lookupResults)
      .filter(item => ['n', 'a', 's'].includes(String(item?.pos || '').toLowerCase()));
    const seen = new Set([lookupWord]);
    const relatedWords = [];

    for (const item of preferredResults) {
      const synonyms = Array.isArray(item?.synonyms) ? item.synonyms : [];
      for (const synonym of synonyms) {
        const normalizedSynonym = normalizeWordNetSynonym(synonym);
        if (!isValidCrosswordWord(normalizedSynonym)) continue;
        if (seen.has(normalizedSynonym)) continue;

        seen.add(normalizedSynonym);
        relatedWords.push({
          word: normalizedSynonym,
          pos: String(item?.pos || '').toLowerCase()
        });
        if (relatedWords.length >= MAX_WORDNET_CANDIDATES_PER_SEED) break;
      }

      if (relatedWords.length >= MAX_WORDNET_CANDIDATES_PER_SEED) break;
    }

    WORDNET_RELATED_CACHE.set(lookupWord, relatedWords);
    return relatedWords;
  } catch {
    WORDNET_RELATED_CACHE.set(lookupWord, []);
    return [];
  }
}

async function fetchWiktionaryDefinitionForWord(wordLower) {
  if (WIKTIONARY_DEFINITION_CACHE.has(wordLower)) {
    return WIKTIONARY_DEFINITION_CACHE.get(wordLower);
  }

  try {
    const data = await fetchJSONOrNull(`${WIKTIONARY_DEFINITION_API}${encodeURIComponent(wordLower)}`);
    if (!data) {
      WIKTIONARY_DEFINITION_CACHE.set(wordLower, null);
      return null;
    }
    const parsedBase = parseWiktionaryDefinitions(data, wordLower);
    const parsed = parsedBase ? { ...parsedBase, source: 'wiktionary-exact' } : null;
    WIKTIONARY_DEFINITION_CACHE.set(wordLower, parsed);
    return parsed;
  } catch {
    WIKTIONARY_DEFINITION_CACHE.set(wordLower, null);
    return null;
  }
}

export async function fetchExactDefinitionForWord(wordText) {
  const lookupWord = String(wordText || '').trim().toLowerCase();
  if (!lookupWord) return null;
  if (EXACT_DEFINITION_CACHE.has(lookupWord)) {
    return EXACT_DEFINITION_CACHE.get(lookupWord);
  }

  if (ENABLE_DATAMUSE_SOURCE) {
    const datamuseDefinition = await fetchDatamuseClueForWord(lookupWord);
    if (datamuseDefinition) {
      EXACT_DEFINITION_CACHE.set(lookupWord, datamuseDefinition);
      return datamuseDefinition;
    }
  }

  if (ENABLE_WORDNET_SOURCE) {
    const wordNetDefinition = await fetchWordNetDefinitionForWord(lookupWord);
    if (wordNetDefinition) {
      EXACT_DEFINITION_CACHE.set(lookupWord, wordNetDefinition);
      return wordNetDefinition;
    }
  }

  if (!ENABLE_WIKTIONARY_SOURCE) {
    EXACT_DEFINITION_CACHE.set(lookupWord, null);
    return null;
  }

  const wiktionaryDefinition = await fetchWiktionaryDefinitionForWord(lookupWord);
  EXACT_DEFINITION_CACHE.set(lookupWord, wiktionaryDefinition || null);
  return wiktionaryDefinition;
}

async function fetchWikidataSearchEntities(seedWord) {
  const lookupWord = String(seedWord || '').trim().toLowerCase();
  if (!lookupWord) return [];
  if (WIKIDATA_SEARCH_CACHE.has(lookupWord)) {
    return WIKIDATA_SEARCH_CACHE.get(lookupWord);
  }

  const params = new URLSearchParams({
    action: 'wbsearchentities',
    search: lookupWord,
    language: 'en',
    format: 'json',
    type: 'item',
    limit: String(MAX_WIKIDATA_RESULTS_PER_SEED)
  });

  try {
    const json = await fetchJSONOrNull(`${WIKIDATA_API}?${params.toString()}`);
    const entities = Array.isArray(json?.search) ? json.search : [];
    WIKIDATA_SEARCH_CACHE.set(lookupWord, entities);
    return entities;
  } catch {
    WIKIDATA_SEARCH_CACHE.set(lookupWord, []);
    return [];
  }
}

function accumulateWikidataCandidate(scored, word, rankIndex, label, description, aliases = [], sourceKind = 'label') {
  const rankWeight = rankIndex < 3 ? 1.12 : rankIndex < 6 ? 0.88 : 0.64;
  const sourceBonus = sourceKind === 'label'
    ? 0.26
    : sourceKind === 'alias'
      ? 0.18
      : 0.1;
  const existing = scored.get(word) || {
    occurrences: 0,
    weight: 0,
    source: 'wikidata-search',
    contextText: ''
  };

  existing.occurrences += 1;
  existing.weight += rankWeight + sourceBonus;
  if (!existing.contextText || existing.weight <= rankWeight + sourceBonus + 0.01) {
    existing.contextText = [label, description, ...aliases.slice(0, 2)].filter(Boolean).join(' ');
  }
  scored.set(word, existing);
}

export async function fetchWikidataThemeWords(themeName, seeds = []) {
  const themeSeeds = [...new Set((Array.isArray(seeds) ? seeds : []).filter(Boolean))]
    .slice(0, MAX_WIKIDATA_SEEDS_PER_THEME);
  if (themeSeeds.length === 0) return [];

  const themeSignals = getThemeSignals(themeName);
  const themeTokens = new Set(tokenize(themeName));
  const scored = new Map();

  for (const seed of themeSeeds) {
    const entities = await fetchWikidataSearchEntities(seed);
    for (let rankIndex = 0; rankIndex < entities.length; rankIndex++) {
      const entity = entities[rankIndex];
      const label = String(entity?.label || '').trim();
      const description = String(entity?.description || '').trim();
      const aliases = Array.isArray(entity?.aliases) ? entity.aliases.map(alias => String(alias || '').trim()).filter(Boolean) : [];
      if (!label || WIKIDATA_GENERIC_DESCRIPTION_REGEX.test(description)) continue;

      const candidateWords = [];
      const normalizedLabel = label.toLowerCase();
      if (isValidCrosswordWord(normalizedLabel)) {
        candidateWords.push({ word: normalizedLabel, sourceKind: 'label' });
      }

      const labelTokens = extractWordCandidatesFromTitle(label)
        .filter(candidate => candidate !== normalizedLabel)
        .filter(candidate => themeTokens.has(candidate) || themeSignals.some(signal => signal.includes(candidate) || candidate.includes(signal)));
      for (const labelToken of labelTokens) {
        candidateWords.push({ word: labelToken, sourceKind: 'label-token' });
      }

      for (const alias of aliases.slice(0, 4)) {
        const normalizedAlias = alias.toLowerCase();
        if (isValidCrosswordWord(normalizedAlias)) {
          candidateWords.push({ word: normalizedAlias, sourceKind: 'alias' });
        }
      }

      for (const candidate of candidateWords) {
        if (!isRelevantWikidataCandidateWord(themeName, candidate.word, label, description, aliases)) continue;
        accumulateWikidataCandidate(scored, candidate.word, rankIndex, label, description, aliases, candidate.sourceKind);
      }
    }

    await sleep(60);
  }

  return [...scored.entries()]
    .sort((a, b) => {
      if (b[1].weight !== a[1].weight) return b[1].weight - a[1].weight;
      return b[1].occurrences - a[1].occurrences;
    })
    .slice(0, 120)
    .map(([word, data]) => ({
      word,
      occurrences: data.occurrences,
      weight: Number(data.weight.toFixed(3)),
      source: data.source,
      contextText: data.contextText
    }));
}

// Rate-limit helper: wait between API calls to be a good citizen
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function categoryToTitle(categoryName) {
  return `Category:${categoryName.replace(/\s+/g, '_')}`;
}

function stripCategoryPrefix(title) {
  return String(title || '').replace(/^Category:/i, '').replace(/_/g, ' ').trim();
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

async function fetchWikipediaCategoryMembers(categoryName, memberType, continueToken = null) {
  const params = new URLSearchParams({
    action: 'query',
    list: 'categorymembers',
    cmtitle: categoryToTitle(categoryName),
    cmtype: memberType,
    cmlimit: '150',
    format: 'json'
  });

  if (continueToken) params.set('cmcontinue', continueToken);

  return fetchWikipediaJSONOrNull(`${WIKIPEDIA_API}?${params.toString()}`);
}

function accumulateWikipediaCandidate(scored, word, depth) {
  const existing = scored.get(word) || {
    occurrences: 0,
    weight: 0,
    depth,
    source: depth === 0 ? 'wikipedia-category' : 'wikipedia-subcategory'
  };

  existing.occurrences += 1;
  existing.weight += Math.max(0.42, 1 - (depth * 0.24));
  existing.depth = Math.min(existing.depth, depth);
  existing.source = existing.depth === 0 ? 'wikipedia-category' : 'wikipedia-subcategory';
  scored.set(word, existing);
}

export async function fetchWikipediaCategoryWords(themeName) {
  const categories = WIKIPEDIA_THEME_CATEGORIES[normalizedThemeKey(themeName)] || [];
  if (categories.length === 0) return [];

  const scored = new Map();
  const categoryQueue = categories.map(categoryName => ({ categoryName, depth: 0 }));
  const queuedCategories = new Set(categories.map(categoryName => normalizedThemeKey(categoryName)));
  const visitedCategories = new Set();
  let discoveredSubcategories = 0;

  while (categoryQueue.length > 0) {
    const current = categoryQueue.shift();
    const categoryKey = normalizedThemeKey(current.categoryName);
    if (visitedCategories.has(categoryKey)) continue;
    visitedCategories.add(categoryKey);

    let pageContinue = null;
    let pageBatches = 0;
    while (pageBatches < MAX_WIKIPEDIA_PAGE_BATCHES_PER_CATEGORY) {
      const json = await fetchWikipediaCategoryMembers(current.categoryName, 'page', pageContinue);
      if (!json) break;
      const members = json?.query?.categorymembers || [];

      for (const member of members) {
        if (WIKIPEDIA_GENERIC_PAGE_TITLE_REGEX.test(String(member?.title || ''))) continue;
        const words = extractWordCandidatesFromTitle(member?.title || '');
        for (const candidateWord of words) {
          if (!isRelevantWikipediaCandidateWord(themeName, candidateWord, current.depth, member?.title || '', current.categoryName)) continue;
          accumulateWikipediaCandidate(scored, candidateWord, current.depth);
        }
      }

      pageContinue = json?.continue?.cmcontinue || null;
      pageBatches += 1;
      await sleep(80);
      if (!pageContinue) break;
    }

    if (current.depth >= MAX_WIKIPEDIA_SUBCATEGORY_DEPTH) continue;
    if (discoveredSubcategories >= MAX_WIKIPEDIA_SUBCATEGORIES_PER_THEME) continue;

    let subcategoryContinue = null;
    let subcategoryBatches = 0;
    while (subcategoryBatches < MAX_WIKIPEDIA_SUBCATEGORY_BATCHES && discoveredSubcategories < MAX_WIKIPEDIA_SUBCATEGORIES_PER_THEME) {
      const json = await fetchWikipediaCategoryMembers(current.categoryName, 'subcat', subcategoryContinue);
      if (!json) break;
      const members = json?.query?.categorymembers || [];
      const rankedSubcategories = [];

      for (const member of members) {
        const nextCategory = stripCategoryPrefix(member?.title || '');
        const nextKey = normalizedThemeKey(nextCategory);
        if (!nextCategory || queuedCategories.has(nextKey) || visitedCategories.has(nextKey)) continue;
        const subcategoryScore = scoreWikipediaSubcategory(themeName, nextCategory);
        if (subcategoryScore < 1.05) continue;

        rankedSubcategories.push({
          categoryName: nextCategory,
          categoryKey: nextKey,
          score: subcategoryScore
        });
      }

      rankedSubcategories.sort((a, b) => b.score - a.score || a.categoryName.localeCompare(b.categoryName));

      for (const rankedSubcategory of rankedSubcategories) {
        categoryQueue.push({ categoryName: rankedSubcategory.categoryName, depth: current.depth + 1 });
        queuedCategories.add(rankedSubcategory.categoryKey);
        discoveredSubcategories++;
        if (discoveredSubcategories >= MAX_WIKIPEDIA_SUBCATEGORIES_PER_THEME) break;
      }

      subcategoryContinue = json?.continue?.cmcontinue || null;
      subcategoryBatches += 1;
      await sleep(80);
      if (!subcategoryContinue) break;
    }
  }

  return [...scored.entries()]
    .sort((a, b) => {
      if (b[1].weight !== a[1].weight) return b[1].weight - a[1].weight;
      if (a[1].depth !== b[1].depth) return a[1].depth - b[1].depth;
      return b[1].occurrences - a[1].occurrences;
    })
    .slice(0, 240)
    .map(([word, data]) => ({
      word,
      occurrences: data.occurrences,
      weight: Number(data.weight.toFixed(3)),
      depth: data.depth,
      source: data.source
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

function pickWordNetSeeds(themeWords, themeName) {
  const nameKeywords = themeName
    .split(/\s*&\s*/)
    .map(keyword => keyword.trim().toLowerCase())
    .filter(keyword => keyword.length >= 3);

  const strongThemeSeeds = themeWords
    .map(wordEntry => ({
      answer: (wordEntry.answer || '').toLowerCase(),
      strength: scoreSeedStrength(themeName, wordEntry),
      anchored: hasLexicalThemeAnchor(themeName, wordEntry)
    }))
    .filter(wordEntry => wordEntry.anchored)
    .filter(wordEntry => wordEntry.answer.length >= 4 && wordEntry.answer.length <= 10)
    .filter(wordEntry => !wordEntry.answer.includes(' ') && !wordEntry.answer.includes('-'))
    .filter(wordEntry => wordEntry.strength >= 1.2)
    .sort((a, b) => b.strength - a.strength || a.answer.localeCompare(b.answer));

  const extras = strongThemeSeeds
    .map(wordEntry => wordEntry.answer)
    .filter(answer => !nameKeywords.includes(answer))
    .slice(0, Math.min(12, EXTRA_SEEDS_PER_THEME));

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
    if (THEME_FILTER_KEYS.size > 0 && !THEME_FILTER_KEYS.has(normalizedThemeKey(theme.name))) {
      continue;
    }

    const existingAnswers = new Set(theme.words.map(w => w.answer.toUpperCase()));
    const seeds = pickSeeds(theme.words, theme.name);
    const wordNetSeeds = pickWordNetSeeds(theme.words, theme.name);
    const wikidataSeeds = wordNetSeeds.length > 0 ? wordNetSeeds : seeds;
    let added = 0;
    const addedByStrategy = new Map(DATAMUSE_STRATEGIES.map(strategy => [strategy.name, 0]));

    console.log(`\n━━━ ${theme.name} ━━━`);
    console.log(`  Pool: ${theme.words.length} words | Seeds: ${seeds.slice(0, 5).join(', ')}... (${seeds.length} total)`);

    if (ENABLE_WIKIDATA_SOURCE) {
      try {
        const wikidataCandidates = await fetchWikidataThemeWords(theme.name, wikidataSeeds);
        let wikidataAdded = 0;

        for (const candidate of wikidataCandidates) {
          if (added >= MAX_NEW_WORDS_PER_THEME) break;
          if (wikidataAdded >= MAX_WIKIDATA_WORDS_PER_THEME) break;

          const word = candidate.word.toUpperCase();
          if (word.length > MAX_ANSWER_LENGTH_FOR_EASY_POOL) continue;
          if (hasHardLetterProfile(word)) continue;
          if (existingAnswers.has(word)) continue;

          const clueData = await fetchExactDefinitionForWord(candidate.word);
          if (!clueData) continue;

          const clueText = clueData.clueText;
          const hint = clueData.hint;
          const themeScore = scoreThemeRelevance(
            theme.name,
            candidate.word,
            `${clueText} ${candidate.contextText || ''}`,
            hint,
            1.0
          ) + Math.min(0.18, candidate.weight * 0.05);
          const clueAccessibility = scoreClueAccessibility(clueText, hint);

          if (themeScore < 1.16) continue;
          if (clueAccessibility < MIN_CLUE_ACCESSIBILITY) continue;

          const candidateEntry = {
            answer: word,
            clue: clueText,
            hint
          };

          if (isLikelyObscureProperNoun(theme.name, word, clueText, hint)) continue;

          const qualityCheck = isWordEntryAcceptable(candidateEntry);
          if (!qualityCheck.ok) continue;

          theme.words.push(await annotateWordEntry({
            answer: word,
            clue: clueText,
            hint,
            source: 'wikidata-search',
            definitionSource: clueData.source,
            themeScore: Number((themeScore + clueAccessibility * 0.08).toFixed(3))
          }));
          existingAnswers.add(word);
          added++;
          wikidataAdded++;
          totalUpdated++;
        }

        if (wikidataAdded > 0) {
          console.log(`  Added ${wikidataAdded} from Wikidata search`);
        }
      } catch {
        // Continue with other sources if Wikidata is unavailable.
      }
    }

    // Add cleaner semantic candidates from curated Wikipedia categories first.
    if (ENABLE_WIKIPEDIA_SOURCE) {
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

          const clueData = await fetchExactDefinitionForWord(candidate.word);
          if (!clueData) continue;

          const clueText = clueData.clueText;
          const hint = clueData.hint;
          const wikipediaBaseScore = candidate.depth === 0 ? 1.15 : 1.08;

          const themeScore = scoreThemeRelevance(
            theme.name,
            candidate.word,
            clueText,
            hint,
            wikipediaBaseScore
          ) + Math.min(0.22, candidate.weight * 0.05) - (candidate.depth * 0.04);
          const clueAccessibility = scoreClueAccessibility(clueText, hint);

          if (clueAccessibility < MIN_CLUE_ACCESSIBILITY) continue;
          if (themeScore < MIN_THEME_RELEVANCE_WIKIPEDIA) continue;

          const candidateEntry = {
            answer: word,
            clue: clueText,
            hint
          };

          if (isLikelyObscureProperNoun(theme.name, word, clueText, hint)) continue;

          const qualityCheck = isWordEntryAcceptable(candidateEntry);
          if (!qualityCheck.ok) continue;

          theme.words.push(await annotateWordEntry({
            answer: word,
            clue: clueText,
            hint,
            source: candidate.source,
            sourceDepth: candidate.depth,
            definitionSource: clueData.source,
            themeScore: Number((themeScore + clueAccessibility * 0.08).toFixed(3))
          }));
          existingAnswers.add(word);
          added++;
          wikiAdded++;
          totalUpdated++;
        }

        if (wikiAdded > 0) {
          console.log(`  Added ${wikiAdded} from deeper Wikipedia categories`);
        }
      } catch {
        // Continue with other sources if Wikipedia API is unavailable.
      }
    }

    if (ENABLE_WORDNET_SOURCE && ENABLE_WORDNET_SYNONYMS) {
      let wordNetAdded = 0;
      for (const seed of wordNetSeeds) {
        if (added >= MAX_NEW_WORDS_PER_THEME) break;
        if (wordNetAdded >= MAX_WORDNET_WORDS_PER_THEME) break;

        const relatedCandidates = await fetchWordNetRelatedWords(seed);
        for (let rankIndex = 0; rankIndex < relatedCandidates.length; rankIndex++) {
          if (added >= MAX_NEW_WORDS_PER_THEME) break;
          if (wordNetAdded >= MAX_WORDNET_WORDS_PER_THEME) break;

          const candidate = relatedCandidates[rankIndex];
          const word = candidate.word.toUpperCase();
          if (word.length > MAX_ANSWER_LENGTH_FOR_EASY_POOL) continue;
          if (hasHardLetterProfile(word)) continue;
          if (existingAnswers.has(word)) continue;

          const clueData = await fetchExactDefinitionForWord(candidate.word);
          if (!clueData) continue;

          const clueText = clueData.clueText;
          const hint = clueData.hint;
          const partOfSpeechBonus = candidate.pos === 'n'
            ? 0.08
            : (candidate.pos === 'a' || candidate.pos === 's' ? 0.05 : 0);
          const themeScore = scoreThemeRelevance(
            theme.name,
            candidate.word,
            clueText,
            hint,
            0.92
          ) + rankAdjustedSourceScore(rankIndex, 0.22) + partOfSpeechBonus;
          const clueAccessibility = scoreClueAccessibility(clueText, hint);

          if (themeScore < 1.14) continue;
          if (clueAccessibility < MIN_CLUE_ACCESSIBILITY) continue;

          const candidateEntry = {
            answer: word,
            clue: clueText,
            hint
          };

          if (isLikelyObscureProperNoun(theme.name, word, clueText, hint)) continue;

          const qualityCheck = isWordEntryAcceptable(candidateEntry);
          if (!qualityCheck.ok) continue;

          theme.words.push(await annotateWordEntry({
            answer: word,
            clue: clueText,
            hint,
            source: 'wordnet-synonym',
            sourceSeed: seed,
            definitionSource: clueData.source,
            themeScore: Number((themeScore + clueAccessibility * 0.08).toFixed(3))
          }));
          existingAnswers.add(word);
          added++;
          wordNetAdded++;
          totalUpdated++;
        }
      }

      if (wordNetAdded > 0) {
        console.log(`  Added ${wordNetAdded} from WordNet synonyms`);
      }
    }

    if (ENABLE_DATAMUSE_EXPANSION) {
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
                const parsedDefs = parseDatamuseDefinitions(d.defs, d.word);
                const definitionData = parsedDefs
                  ? { ...parsedDefs, source: 'datamuse-exact' }
                  : await fetchWiktionaryDefinitionForWord(d.word);
                if (!definitionData) continue;

                const clueText = definitionData.clueText;
                const hint = definitionData.hint;

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

                if (isLikelyObscureProperNoun(theme.name, word, clueText, hint)) continue;

                const qualityCheck = isWordEntryAcceptable(candidate);
                if (!qualityCheck.ok) continue;

                theme.words.push(await annotateWordEntry({
                  answer: word,
                  clue: clueText,
                  hint: hint,
                  source: strategy.name,
                  definitionSource: definitionData.source,
                  themeScore: Number((themeScore + clueAccessibility * 0.08).toFixed(3))
                }));
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
