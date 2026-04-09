import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateLayout } from 'crossword-layout-generator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../public/data');
const PUZZLES_DIR = path.join(DATA_DIR, 'puzzles');
const INDEX_FILE = path.join(DATA_DIR, 'puzzles.json');

// ─── Theme Database ────────────────────────────────────────────────────────
const THEMES_FILE = path.join(__dirname, 'themes.json');
const THEMES = JSON.parse(fs.readFileSync(THEMES_FILE, 'utf8'));

// ─── Puzzle Generation Engine ──────────────────────────────────────────────
function generateBestLayout(words, attempts = 4000, maxWords = 18) {
  let best = null;
  let bestScore = -1000;

  for (let i = 0; i < attempts; i++) {
    // Use a subset of words to explicitly keep puzzles small
    // Also reject words with clues that are too long (over 80 characters)
    const filteredWords = words.filter(w => w.clue.length <= 80);
    const shuffled = [...filteredWords].sort(() => Math.random() - 0.5);
    const subset = shuffled.slice(0, maxWords);
    const input = subset.map(w => ({ 
      answer: w.answer.toLowerCase(), 
      clue: w.clue,
      hint: w.hint || null 
    }));
    let layout = generateLayout(input);
    layout.result = layout.result.filter(w => w.orientation === 'across' || w.orientation === 'down');
    
    // Trim early to check true dimensions
    layout = trimGrid(layout);
    if (!layout.table || layout.rows === 0 || layout.cols === 0) continue;
    
    // Enforce 12x12 size limits to keep readable on mobile
    if (layout.rows > 12 || layout.cols > 12) continue;

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
    const avgIntersections = layout.result.length > 0 ? wordIntersections.reduce((a,b)=>a+b,0) / layout.result.length : 0;

    const total = layout.rows * layout.cols;
    const density = filled / total;
    const placedRatio = layout.result.length / maxWords;
    
    // Severely penalize large footprint areas to force density
    const areaPenalty = total > 100 ? (total - 100) * 0.1 : 0;
    
    // Penalize highly rectangular/not-square grids
    const ratio = Math.max(layout.rows / layout.cols, layout.cols / layout.rows);
    const ratioPenalty = ratio > 1.3 ? (ratio - 1.3) * 0.5 : 0;

    // Favor layouts where minimum overlap is >=2
    const overlapBonus = (minIntersections >= 2 ? 50 : 0) + (avgIntersections * 5);

    const score = (density * 10.0) + (placedRatio * 2.0) + overlapBonus - areaPenalty - ratioPenalty;

    if (score > bestScore) {
      bestScore = score;
      best = layout;
    }
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
  console.log(`Theme: ${themeName} | Available Words Pool: ${availableWords.length}`);

  let layout = null;
  let maxWordsTry = Math.min(16, availableWords.length);
  
  while (!layout && maxWordsTry >= 6) {
      layout = generateBestLayout(availableWords, 50, maxWordsTry);
      if (!layout) {
          maxWordsTry--;
      }
  }

  if (!layout) {
      // Fallback: if we STILL couldn't get a 12x12 grid with intersections after decaying to 6 words, we run one final time with no bounds but keeping the 12x12 limit by passing an aggressive attempt count for a very small word set
      layout = generateBestLayout(availableWords, 1000, 6);
  }
  
  if (!layout) {
      console.error(`ERROR: Could not generate a constrained puzzle for ${themeName}.`);
      process.exit(1);
  }

  const title = themeName;

  const puzzle = layoutToNightcrossing(layout, id, title, themeName);
  
  // Return puzzle and the words that were actually placed
  const usedWords = layout.result.map(w => w.answer.toUpperCase());
  return { puzzle, usedWords };
}

export { THEMES };
