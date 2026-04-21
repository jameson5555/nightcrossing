import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { humanizeClue } from './humanizeClue.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const THEMES_FILE = path.join(__dirname, 'themes.json');

// How many existing words to use as additional seeds per theme
const EXTRA_SEEDS_PER_THEME = 10;

// Datamuse API endpoints that return different kinds of related words
const DATAMUSE_STRATEGIES = [
  (kw) => `https://api.datamuse.com/words?ml=${encodeURIComponent(kw)}&md=d&max=80`,      // meaning-like
  (kw) => `https://api.datamuse.com/words?rel_trg=${encodeURIComponent(kw)}&md=d&max=60`,  // statistically triggered/associated
  (kw) => `https://api.datamuse.com/words?rel_spc=${encodeURIComponent(kw)}&md=d&max=40`,  // hyponyms (more specific than)
];

// Rate-limit helper: wait between API calls to be a good citizen
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
    .map(w => w.answer.toLowerCase())
    .filter(w => w.length >= 3 && w.length <= 10 && !w.includes(' ') && !w.includes('-'));

  // Shuffle deterministically based on current month so we get fresh seeds each run
  const now = new Date();
  const monthSeed = now.getFullYear() * 12 + now.getMonth();
  const shuffled = candidates
    .map((item, i) => ({ item, sort: Math.sin(i * 9301 + monthSeed * 49297) }))
    .sort((a, b) => a.sort - b.sort)
    .map(x => x.item);

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

async function fetchThemeWords() {
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

    console.log(`\n━━━ ${theme.name} ━━━`);
    console.log(`  Pool: ${theme.words.length} words | Seeds: ${seeds.slice(0, 5).join(', ')}... (${seeds.length} total)`);

    for (const seed of seeds) {
      for (const buildUrl of DATAMUSE_STRATEGIES) {
        const url = buildUrl(seed);
        try {
          const res = await fetch(url);
          const data = await res.json();

          for (const d of data) {
            const word = d.word.toUpperCase();

            if (!isValidCrosswordWord(d.word)) continue;
            if (existingAnswers.has(word)) continue;

            if (d.defs && d.defs.length > 0) {
              // Parse primary definition
              const rawDef = d.defs[0];
              const parts = rawDef.split('\t');
              let cleanDef = parts.length > 1 ? parts[1].trim() : parts[0].trim();
              cleanDef = cleanDef.replace(/^\([^)]+\)\s*/, '');
              cleanDef = cleanDef.charAt(0).toUpperCase() + cleanDef.slice(1);

              // Try to get a hint from a second definition
              let hint = null;
              if (d.defs.length > 1) {
                const hintDef = d.defs[1];
                const hintParts = hintDef.split('\t');
                const cleanHint = hintParts.length > 1 ? hintParts[1].trim() : hintParts[0].trim();
                hint = humanizeClue(cleanHint);
              }

              theme.words.push({
                answer: word,
                clue: humanizeClue(cleanDef),
                hint: hint
              });
              existingAnswers.add(word);
              added++;
              totalUpdated++;
            }
          }
        } catch (err) {
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

fetchThemeWords();
