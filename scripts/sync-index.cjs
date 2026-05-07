#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '../public/data');
const PUZZLES_DIR = path.join(DATA_DIR, 'puzzles');
const INDEX_FILE = path.join(DATA_DIR, 'puzzles.json');
const META_FILE = path.join(DATA_DIR, 'puzzles.meta.json');
const PUZZLES_PER_SET = 3;

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

function syncIndex() {
  if (!fs.existsSync(PUZZLES_DIR)) {
    console.error('No puzzles directory at', PUZZLES_DIR);
    process.exit(1);
  }

  const files = fs.readdirSync(PUZZLES_DIR).filter(f => f.endsWith('.json')).sort();
  const entries = [];
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

    entries.push({
      id,
      title: puzzle.title || '',
      author: puzzle.author || '',
      date: waveLabel || puzzle.date || '',
      cols,
      rows,
      letterCells,
      theme: puzzle.theme || ''
    });
  }

  entries.sort((a, b) => a.id.localeCompare(b.id));

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
