import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../public/data');
const PUZZLES_DIR = path.join(DATA_DIR, 'puzzles');
const INDEX_FILE = path.join(DATA_DIR, 'puzzles.json');

async function fetchLatestPuzzle() {
  console.log('Fetching latest crossword puzzle...');
  
  try {
    const today = new Date().toISOString().split('T')[0];
    const OUT_FILE = path.join(PUZZLES_DIR, `${today}.json`);

    // Mock payload (in reality, this would fetch from an API like doshea/nyt_crosswords)
    const puzzleData = {
      id: today,
      title: "Daily Syndicated Crossword",
      author: "Auto-Fetched",
      date: today,
      size: { cols: 5, rows: 5 },
      grid: [
        "S", "O", "L", "A", "R",
        "E", "P", "I", "C", "S",
        "C", "E", "N", "T", "S",
        "R", "R", "E", "S", "T",
        "E", "A", "S", "E", "S"
      ],
      gridnums: [
        1, 2, 3, 4, 5,
        6, 0, 0, 0, 0,
        7, 0, 0, 0, 0,
        8, 0, 0, 0, 0,
        9, 0, 0, 0, 0
      ],
      clues: {
        across: ["1. Sun-related", "6. Grand tales", "7. Pennies", "8. Relax", "9. Comforts"],
        down: ["1. Hidden", "2. House performing arts", "3. Outlines", "4. Serves (legal)", "5. R&B artists (pl.)"]
      },
      answers: {
        across: ["SOLAR", "EPICS", "CENTS", "RREST", "EASES"],
        down: ["SECRE", "OPERA", "LINES", "ACTSE", "RSSTS"]
      }
    };

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
        // if empty or corrupted, ignore
      }
    }

    // Only add if not already in index
    if (!indexData.find(p => p.id === today)) {
      indexData.unshift({
        id: puzzleData.id,
        title: puzzleData.title,
        author: puzzleData.author,
        date: puzzleData.date,
        cols: puzzleData.size.cols,
        rows: puzzleData.size.rows
      });
      fs.writeFileSync(INDEX_FILE, JSON.stringify(indexData, null, 2));
      console.log(`Successfully updated index file ${INDEX_FILE}`);
    } else {
      console.log('Puzzle for today already exists in index.');
    }

  } catch (error) {
    console.error('Failed to fetch or parse puzzle:', error);
    process.exit(1);
  }
}

fetchLatestPuzzle();
