import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateProceduralPuzzle } from './proceduralEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../public/data');
const PUZZLES_DIR = path.join(DATA_DIR, 'puzzles');
const INDEX_FILE = path.join(DATA_DIR, 'puzzles.json');

async function fetchLatestPuzzle() {
  const today = new Date().toISOString().split('T')[0];
  const OUT_FILE = path.join(PUZZLES_DIR, `${today}.json`);

  try {
    const puzzleData = await generateProceduralPuzzle(today, `Daily Crossword (${today})`, 18);
    
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(PUZZLES_DIR)) fs.mkdirSync(PUZZLES_DIR, { recursive: true });

    fs.writeFileSync(OUT_FILE, JSON.stringify(puzzleData, null, 2));

    let indexData = [];
    if (fs.existsSync(INDEX_FILE)) {
      indexData = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
    }

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
    }
    console.log("Daily procedural puzzle successfully created!");
  } catch (error) {
    console.error('Failed to generate puzzle:', error);
    process.exit(1);
  }
}

fetchLatestPuzzle();
