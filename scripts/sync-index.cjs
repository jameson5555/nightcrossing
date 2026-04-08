#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../public/data');
const PUZZLES_DIR = path.join(DATA_DIR, 'puzzles');
const INDEX_FILE = path.join(DATA_DIR, 'puzzles.json');

function loadJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error('Failed to read JSON', filePath, e.message);
    return null;
  }
}

function syncIndex() {
  if (!fs.existsSync(PUZZLES_DIR)) {
    console.error('No puzzles directory at', PUZZLES_DIR);
    process.exit(1);
  }

  const files = fs.readdirSync(PUZZLES_DIR).filter(f => f.endsWith('.json'));
  const entries = [];

  for (const file of files) {
    const full = path.join(PUZZLES_DIR, file);
    const puzzle = loadJSON(full);
    if (!puzzle) continue;
    const id = puzzle.id || path.basename(file, '.json');
    const cols = puzzle.size && typeof puzzle.size.cols === 'number' ? puzzle.size.cols : (puzzle.cols || 0);
    const rows = puzzle.size && typeof puzzle.size.rows === 'number' ? puzzle.size.rows : (puzzle.rows || 0);
    let letterCells = 0;
    if (Array.isArray(puzzle.grid)) {
      letterCells = puzzle.grid.filter(c => c !== '.').length;
    } else if (cols && rows) {
      letterCells = cols * rows;
    }

    entries.push({
      id,
      title: puzzle.title || '',
      author: puzzle.author || '',
      date: puzzle.date || '',
      cols,
      rows,
      letterCells,
      theme: puzzle.theme || ''
    });
  }

  entries.sort((a, b) => a.id.localeCompare(b.id));

  fs.writeFileSync(INDEX_FILE, JSON.stringify(entries, null, 2));
  console.log(`Wrote ${entries.length} entries to ${INDEX_FILE}`);
}

syncIndex();
