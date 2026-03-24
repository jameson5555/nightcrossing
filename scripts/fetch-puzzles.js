import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../public/data');
const PUZZLES_DIR = path.join(DATA_DIR, 'puzzles');
const INDEX_FILE = path.join(DATA_DIR, 'puzzles.json');

async function fetchLatestPuzzle() {
  console.log('Fetching latest crossword puzzle from historical archive...');
  
  try {
    const today = new Date().toISOString().split('T')[0];
    const OUT_FILE = path.join(PUZZLES_DIR, `${today}.json`);

    // Fetch a random puzzle from the historical doshea NYT archive
    let puzzleData = null;
    let attempts = 0;
    while (!puzzleData && attempts < 10) {
      // Random year between 1990 and 2020
      const year = Math.floor(Math.random() * (2020 - 1990 + 1)) + 1990;
      // Random month 1-12
      const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
      // Random day 1-28
      const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
      
      const url = `https://raw.githubusercontent.com/doshea/nyt_crosswords/master/${year}/${month}/${day}.json`;
      console.log(`Attempting to fetch ${url}...`);
      
      const res = await fetch(url);
      if (res.ok) {
        puzzleData = await res.json();
      }
      attempts++;
    }

    if (!puzzleData) {
      throw new Error("Failed to find a valid historical puzzle after 10 attempts.");
    }

    // Overwrite the ID and date so it acts as "Today's" puzzle for Nightcrossing
    puzzleData.id = today;
    puzzleData.title = puzzleData.title || `Daily Crossword (${today})`;

    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(PUZZLES_DIR)) {
      fs.mkdirSync(PUZZLES_DIR, { recursive: true });
    }

    // Write the new puzzle JSON
    fs.writeFileSync(OUT_FILE, JSON.stringify(puzzleData, null, 2));
    console.log(`Successfully saved puzzle to ${OUT_FILE}`);

    // Update the index
    let indexData = [];
    if (fs.existsSync(INDEX_FILE)) {
      try {
        indexData = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
      } catch (e) {
        // ignore
      }
    }

    if (!indexData.find(p => p.id === today)) {
      indexData.unshift({
        id: puzzleData.id,
        title: puzzleData.title,
        author: puzzleData.author || "Unknown",
        date: today,
        cols: puzzleData.size.cols,
        rows: puzzleData.size.rows
      });
      fs.writeFileSync(INDEX_FILE, JSON.stringify(indexData, null, 2));
      console.log(`Successfully updated index file ${INDEX_FILE}`);
    }

  } catch (error) {
    console.error('Failed to fetch or parse puzzle:', error);
    process.exit(1);
  }
}

fetchLatestPuzzle();
