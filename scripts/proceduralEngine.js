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
    const shuffled = [...words].sort(() => Math.random() - 0.5);
    // Use a subset of words to explicitly keep puzzles small
    const subset = shuffled.slice(0, maxWords);
    const input = subset.map(w => ({ answer: w.answer.toLowerCase(), clue: w.clue }));
    let layout = generateLayout(input);
    
    // Trim early to check true dimensions
    layout = trimGrid(layout);
    if (!layout.table || layout.rows === 0 || layout.cols === 0) continue;

    let filled = 0;
    for (let r = 0; r < layout.rows; r++) {
      for (let c = 0; c < layout.cols; c++) {
        if (layout.table[r][c] !== '-') filled++;
      }
    }
    const total = layout.rows * layout.cols;
    const density = filled / total;
    const placedRatio = layout.result.length / maxWords;
    
    // Severely penalize large footprint areas to force density
    const areaPenalty = total > 100 ? (total - 100) * 0.1 : 0;
    
    // Penalize highly rectangular/not-square grids
    const ratio = Math.max(layout.rows / layout.cols, layout.cols / layout.rows);
    const ratioPenalty = ratio > 1.3 ? (ratio - 1.3) * 0.5 : 0;

    const score = (density * 10.0) + (placedRatio * 2.0) - areaPenalty - ratioPenalty;

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
    if (item.orientation === 'across') {
      clues.across.push(prefix + item.clue);
      answers.across.push(item.answer.toUpperCase());
    } else {
      clues.down.push(prefix + item.clue);
      answers.down.push(item.answer.toUpperCase());
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
    answers
  };
}

export function generateThemedPuzzle(id, themeName, availableWords) {
  console.log(`Theme: ${themeName} | Available Words Pool: ${availableWords.length}`);

  // Push for density but prevent memory hanging by limiting layout attempts
  const layout = generateBestLayout(availableWords, 1500, Math.min(18, availableWords.length));
  const title = `${themeName} Crossword`;

  const puzzle = layoutToNightcrossing(layout, id, title, themeName);
  
  // Return puzzle and the words that were actually placed
  const usedWords = layout.result.map(w => w.answer.toUpperCase());
  return { puzzle, usedWords };
}

export { THEMES };
