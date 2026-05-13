#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '../public/data');
const PUZZLES_DIR = path.join(DATA_DIR, 'puzzles');
const INDEX_FILE = path.join(DATA_DIR, 'puzzles.json');
const META_FILE = path.join(DATA_DIR, 'puzzles.meta.json');
const THEMES_FILE = path.join(__dirname, 'themes.json');
const PUZZLES_PER_SET = 3;
const LONG_WORD_LENGTH = 8;
const VERY_LONG_WORD_LENGTH = 10;
const NORMAL_QUANTILE = 0.6;
const HARD_QUANTILE = 0.85;

function parseVolumeFromId(id) {
  const match = String(id || '').match(/-vol(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

function formatWaveLabel(volume) {
  if (!Number.isInteger(volume) || volume < 1) return '';
  const waveNumber = Math.floor((volume - 1) / PUZZLES_PER_SET) + 1;
  return `Wave ${waveNumber}`;
}

function loadJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error('Failed to read JSON', filePath, e.message);
    return null;
  }
}

function loadThemeOrder() {
  const themes = loadJSON(THEMES_FILE);
  if (!Array.isArray(themes)) return [];
  return themes
    .map(theme => theme && theme.name)
    .filter(name => typeof name === 'string' && name.trim() !== '');
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parseClueNumber(entry) {
  if (typeof entry !== 'string') return null;
  const match = entry.match(/^(\d+)\./);
  return match ? Number(match[1]) : null;
}

function collectWordPathFromStart(grid, cols, rows, startIndex, direction) {
  const indices = [];
  if (!Array.isArray(grid) || !cols || !rows) return indices;

  if (direction === 'across') {
    const row = Math.floor(startIndex / cols);
    for (let col = startIndex % cols; col < cols; col++) {
      const idx = row * cols + col;
      if (grid[idx] === '.') break;
      indices.push(idx);
    }
  } else {
    for (let row = Math.floor(startIndex / cols); row < rows; row++) {
      const idx = row * cols + (startIndex % cols);
      if (grid[idx] === '.') break;
      indices.push(idx);
    }
  }

  return indices;
}

function collectWordPaths(puzzle, cols, rows) {
  const grid = puzzle?.grid;
  const gridnums = puzzle?.gridnums;
  if (!Array.isArray(grid) || !Array.isArray(gridnums) || !cols || !rows) return [];

  const acrossByNumber = new Set();
  const downByNumber = new Set();

  for (const entry of puzzle?.clues?.across || []) {
    const number = parseClueNumber(entry);
    if (number !== null) acrossByNumber.add(number);
  }

  for (const entry of puzzle?.clues?.down || []) {
    const number = parseClueNumber(entry);
    if (number !== null) downByNumber.add(number);
  }

  const paths = [];
  for (let i = 0; i < gridnums.length; i++) {
    const clueNum = gridnums[i];
    if (!clueNum || grid[i] === '.') continue;

    if (acrossByNumber.has(clueNum)) {
      const indices = collectWordPathFromStart(grid, cols, rows, i, 'across');
      if (indices.length > 0) paths.push(indices);
    }

    if (downByNumber.has(clueNum)) {
      const indices = collectWordPathFromStart(grid, cols, rows, i, 'down');
      if (indices.length > 0) paths.push(indices);
    }
  }

  return paths;
}

function computeDifficultyScore(puzzle, cols, rows, letterCells) {
  const totalCells = cols * rows;
  const density = totalCells > 0 ? letterCells / totalCells : 0;
  const paths = collectWordPaths(puzzle, cols, rows);

  if (paths.length === 0) {
    return clamp((density - 0.34) / 0.16, 0, 1);
  }

  const occupancy = new Map();
  for (const path of paths) {
    for (const idx of path) {
      occupancy.set(idx, (occupancy.get(idx) || 0) + 1);
    }
  }

  const intersectionsPerWord = paths.map(path => {
    let count = 0;
    for (const idx of path) {
      if ((occupancy.get(idx) || 0) > 1) count++;
    }
    return count;
  });

  const minIntersectionsPerWord = intersectionsPerWord.length > 0
    ? Math.min(...intersectionsPerWord)
    : 0;

  const avgIntersectionsPerWord = intersectionsPerWord.length > 0
    ? intersectionsPerWord.reduce((sum, count) => sum + count, 0) / intersectionsPerWord.length
    : 0;

  const wordLengths = paths.map(path => path.length);
  const longWordIndices = wordLengths
    .map((len, idx) => ({ len, idx }))
    .filter(item => item.len >= LONG_WORD_LENGTH)
    .map(item => item.idx);

  const veryLongWordIndices = wordLengths
    .map((len, idx) => ({ len, idx }))
    .filter(item => item.len >= VERY_LONG_WORD_LENGTH)
    .map(item => item.idx);

  const longWordsWithTwoPlusCrossings = longWordIndices
    .filter(idx => (intersectionsPerWord[idx] || 0) >= 2)
    .length;

  const veryLongWordsWithThreePlusCrossings = veryLongWordIndices
    .filter(idx => (intersectionsPerWord[idx] || 0) >= 3)
    .length;

  const longWordTwoPlusRate = longWordIndices.length > 0
    ? longWordsWithTwoPlusCrossings / longWordIndices.length
    : 1;

  const veryLongWordThreePlusRate = veryLongWordIndices.length > 0
    ? veryLongWordsWithThreePlusCrossings / veryLongWordIndices.length
    : 1;

  const adjacency = paths.map(() => new Set());
  const indexToWords = new Map();
  paths.forEach((path, wordIdx) => {
    for (const idx of path) {
      if (!indexToWords.has(idx)) indexToWords.set(idx, []);
      indexToWords.get(idx).push(wordIdx);
    }
  });

  for (const wordIndexes of indexToWords.values()) {
    for (let i = 0; i < wordIndexes.length; i++) {
      for (let j = i + 1; j < wordIndexes.length; j++) {
        const a = wordIndexes[i];
        const b = wordIndexes[j];
        adjacency[a].add(b);
        adjacency[b].add(a);
      }
    }
  }

  let connected = true;
  if (paths.length > 1) {
    const visited = new Set();
    const stack = [0];
    while (stack.length > 0) {
      const node = stack.pop();
      if (visited.has(node)) continue;
      visited.add(node);
      for (const next of adjacency[node]) {
        if (!visited.has(next)) stack.push(next);
      }
    }
    connected = visited.size === paths.length;
  }

  let score = 0;
  score += clamp((density - 0.34) / 0.16, 0, 1) * 0.34;
  score += (1 - clamp(avgIntersectionsPerWord / 2.2, 0, 1)) * 0.22;
  score += (1 - clamp(minIntersectionsPerWord / 1.2, 0, 1)) * 0.14;
  score += (1 - longWordTwoPlusRate) * 0.18;
  score += (1 - veryLongWordThreePlusRate) * 0.09;
  score += connected ? 0 : 0.03;
  score += clamp((paths.length - 8) / 6, 0, 1) * 0.03;

  return clamp(score, 0, 1);
}

function quantile(sortedValues, q) {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) return 0;
  const clampedQ = clamp(q, 0, 1);
  const position = (sortedValues.length - 1) * clampedQ;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sortedValues[lower];

  const weight = position - lower;
  return (sortedValues[lower] * (1 - weight)) + (sortedValues[upper] * weight);
}

function assignDifficultyById(drafts) {
  const byDifficulty = [...drafts].sort((a, b) => {
    if (a.difficultyScore !== b.difficultyScore) return a.difficultyScore - b.difficultyScore;
    return a.id.localeCompare(b.id);
  });

  const scores = byDifficulty.map(item => item.difficultyScore);
  const normalThreshold = quantile(scores, NORMAL_QUANTILE);
  const hardThreshold = quantile(scores, HARD_QUANTILE);
  const result = new Map();

  byDifficulty.forEach((item) => {
    let label = 'Expert';
    if (item.difficultyScore <= normalThreshold) label = 'Normal';
    else if (item.difficultyScore <= hardThreshold) label = 'Hard';
    result.set(item.id, label);
  });

  return result;
}

function syncIndex() {
  if (!fs.existsSync(PUZZLES_DIR)) {
    console.error('No puzzles directory at', PUZZLES_DIR);
    process.exit(1);
  }

  const files = fs.readdirSync(PUZZLES_DIR).filter(f => f.endsWith('.json')).sort();
  const entryDrafts = [];
  const hasher = crypto.createHash('sha256');

  for (const file of files) {
    const full = path.join(PUZZLES_DIR, file);
    const raw = fs.readFileSync(full, 'utf8');
    hasher.update(file);
    hasher.update('\n');
    hasher.update(raw);
    hasher.update('\n');

    const puzzle = loadJSON(full);
    if (!puzzle) continue;
    const id = puzzle.id || path.basename(file, '.json');
    const volume = parseVolumeFromId(id);
    const waveLabel = formatWaveLabel(volume);
    const cols = puzzle.size && typeof puzzle.size.cols === 'number' ? puzzle.size.cols : (puzzle.cols || 0);
    const rows = puzzle.size && typeof puzzle.size.rows === 'number' ? puzzle.size.rows : (puzzle.rows || 0);
    let letterCells = 0;
    if (Array.isArray(puzzle.grid)) {
      letterCells = puzzle.grid.filter(c => c !== '.').length;
    } else if (cols && rows) {
      letterCells = cols * rows;
    }

    const difficultyScore = computeDifficultyScore(puzzle, cols, rows, letterCells);

    entryDrafts.push({
      id,
      title: puzzle.title || '',
      author: puzzle.author || '',
      date: waveLabel || puzzle.date || '',
      cols,
      rows,
      letterCells,
      theme: puzzle.theme || '',
      difficultyScore,
      existingDifficulty: typeof puzzle.difficulty === 'string' ? puzzle.difficulty : ''
    });
  }

  const difficultyById = assignDifficultyById(entryDrafts);
  const entries = entryDrafts.map(draft => ({
    id: draft.id,
    title: draft.title,
    author: draft.author,
    date: draft.date,
    cols: draft.cols,
    rows: draft.rows,
    letterCells: draft.letterCells,
    theme: draft.theme,
    difficulty: difficultyById.get(draft.id) || draft.existingDifficulty || 'Normal'
  }));

  const themeOrder = loadThemeOrder();
  const themeOrderMap = new Map(themeOrder.map((name, idx) => [name, idx]));

  entries.sort((a, b) => {
    const themeIdxA = themeOrderMap.has(a.theme) ? themeOrderMap.get(a.theme) : Number.MAX_SAFE_INTEGER;
    const themeIdxB = themeOrderMap.has(b.theme) ? themeOrderMap.get(b.theme) : Number.MAX_SAFE_INTEGER;
    if (themeIdxA !== themeIdxB) return themeIdxA - themeIdxB;

    const volA = parseVolumeFromId(a.id) ?? Number.MAX_SAFE_INTEGER;
    const volB = parseVolumeFromId(b.id) ?? Number.MAX_SAFE_INTEGER;
    if (volA !== volB) return volA - volB;

    return a.id.localeCompare(b.id);
  });

  const version = hasher.digest('hex').slice(0, 16);
  const meta = {
    version,
    puzzleCount: entries.length,
    generatedAt: new Date().toISOString()
  };

  fs.writeFileSync(INDEX_FILE, JSON.stringify(entries, null, 2));
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
  console.log(`Wrote ${entries.length} entries to ${INDEX_FILE}`);
  console.log(`Wrote dataset version ${version} to ${META_FILE}`);
}

syncIndex();
