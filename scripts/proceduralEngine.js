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
const MIN_PLACED_WORDS = 7;
const PREFERRED_MIN_PLACED_WORDS = 8;
const MIN_WORD_TARGET = 7;
const DEFAULT_LAYOUT_ATTEMPTS = 6000;
const VERBOSE_GENERATION = process.env.NC_VERBOSE_GENERATION === '1';

const SCORE_WEIGHTS = {
  minIntersection: 32,
  avgIntersection: 44,
  totalIntersection: 7,
  minTwoBonus: 36,
  wordCount: 16,
  placedRatio: 26,
  wordFloorBonus: 18,
  density: 6,
  squareBonus: 3,
  ratioPenalty: 3.5
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
  return typeof word.themeScore === 'number' ? word.themeScore : 0;
}

function pickCandidateSubset(words, maxWords, letterFrequency) {
  if (words.length <= maxWords) {
    return shuffleArray(words);
  }

  const scored = words.map(word => {
    const len = word.answer.length;
    const crossability = wordCrossabilityScore(word.answer, letterFrequency);
    const themeScore = themeRelevanceScore(word);
    const lenSuitability =
      len <= 4 ? 1.5 :
      len <= 7 ? 1.55 :
      len <= 9 ? 0.95 :
      len <= 10 ? 0.35 :
      0;
    const priority = (crossability * 2.8) + (themeScore * 1.5) + lenSuitability;
    return { word, len, priority };
  });

  const long = shuffleArray(scored.filter(item => item.len >= 8)).sort((a, b) => b.priority - a.priority);
  const medium = shuffleArray(scored.filter(item => item.len >= 5 && item.len <= 7)).sort((a, b) => b.priority - a.priority);
  const short = shuffleArray(scored.filter(item => item.len <= 4)).sort((a, b) => b.priority - a.priority);

  const targetLong = Math.min(long.length, Math.max(1, Math.round(maxWords * 0.08)));
  const targetShort = Math.min(short.length, Math.max(3, Math.round(maxWords * 0.4)));
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

  takeFromBucket(long, targetLong);
  takeFromBucket(medium, targetMedium);
  takeFromBucket(short, targetShort);

  const leftovers = shuffleArray(scored)
    .filter(item => !selectedSet.has(item.word.answer))
    .sort((a, b) => b.priority - a.priority);

  for (const item of leftovers) {
    if (selected.length >= maxWords) break;
    selected.push(item);
  }

  return selected
    .sort((a, b) => (b.priority + Math.random() * 1.2) - (a.priority + Math.random() * 1.2))
    .slice(0, maxWords)
    .map(item => item.word);
}

// ─── Puzzle Generation Engine ──────────────────────────────────────────────
function generateBestLayout(words, attempts = DEFAULT_LAYOUT_ATTEMPTS, maxWords = 18, minPlacedWords = MIN_PLACED_WORDS) {
  let best = null;
  let bestScore = -1000;

  // Pre-filter: reject weak, unsafe, or low-quality clue entries.
  const preFiltered = words.filter(w => {
    if (w.clue.length > 80) return false;
    if (w.answer.length > Math.max(MAX_GRID_ROWS, MAX_GRID_COLS)) return false;

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
      : pickCandidateSubset(preFiltered, maxWords, letterFrequency);
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

    const total = layout.rows * layout.cols;
    const density = filled / total;
    const placedRatio = layout.result.length / maxWords;
    
    // Penalize highly rectangular/not-square grids
    const ratio = Math.max(layout.rows / layout.cols, layout.cols / layout.rows);
    const ratioPenalty = ratio > 1.25 ? (ratio - 1.25) * SCORE_WEIGHTS.ratioPenalty : 0;
    const squareBonus = ratio <= 1.15 ? SCORE_WEIGHTS.squareBonus : 0;

    // Priority order: overlaps first, then word count, then density.
    const overlapScore =
      (minIntersections * SCORE_WEIGHTS.minIntersection) +
      (avgIntersections * SCORE_WEIGHTS.avgIntersection) +
      (totalIntersections * SCORE_WEIGHTS.totalIntersection) +
      (minIntersections >= 2 ? SCORE_WEIGHTS.minTwoBonus : 0);

    const wordCountScore =
      (layout.result.length * SCORE_WEIGHTS.wordCount) +
      (placedRatio * SCORE_WEIGHTS.placedRatio);
    const wordFloorBonus = layout.result.length >= PREFERRED_MIN_PLACED_WORDS
      ? SCORE_WEIGHTS.wordFloorBonus
      : 0;

    const densityScore = density * SCORE_WEIGHTS.density;

    const score = overlapScore + wordCountScore + wordFloorBonus + densityScore + squareBonus - ratioPenalty;

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
    
    if (item.hint) {
      hints[id] = item.hint;
    }
  });

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

export function generateThemedPuzzle(id, themeName, availableWords) {
  if (VERBOSE_GENERATION) {
    console.log(`Theme: ${themeName} | Available Words Pool: ${availableWords.length}`);
  }

  let layout = null;
  let bestScore = -Infinity;
  let maxWordsTry = Math.min(14, availableWords.length);

  while (maxWordsTry >= MIN_WORD_TARGET) {
    const attempts =
    maxWordsTry >= 13 ? 3000 :
    maxWordsTry >= 11 ? 2300 :
    maxWordsTry >= 9 ? 1700 :
    1300;

    const requiredPlaced = Math.min(
      maxWordsTry,
      Math.max(PREFERRED_MIN_PLACED_WORDS, Math.floor(maxWordsTry * 0.7))
    );
    const candidate = generateBestLayout(availableWords, attempts, maxWordsTry, requiredPlaced);
    if (candidate) {
      const candidateScore = typeof candidate._engineScore === 'number' ? candidate._engineScore : -Infinity;
      if (candidateScore > bestScore) {
        bestScore = candidateScore;
        layout = candidate;
      }

      // Early exit once we place nearly all requested words at this target.
      if (candidate.result.length >= Math.max(requiredPlaced, maxWordsTry - 1)) {
        break;
      }
    }

    maxWordsTry--;
  }

  if (!layout) {
    // Fallback: one final dense-search pass on a small target set under the 10x10 cap.
    layout = generateBestLayout(availableWords, 2500, MIN_WORD_TARGET, Math.min(MIN_PLACED_WORDS, MIN_WORD_TARGET));
  }

  // If we only found a 7-word layout, try one more targeted pass for an 8-word floor.
  if (layout && layout.result.length < PREFERRED_MIN_PLACED_WORDS && availableWords.length >= PREFERRED_MIN_PLACED_WORDS + 2) {
    const recovery = generateBestLayout(
      availableWords,
      2200,
      Math.min(14, availableWords.length),
      PREFERRED_MIN_PLACED_WORDS
    );
    if (recovery) {
      layout = recovery;
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
