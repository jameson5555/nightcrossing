import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../public/data');
const PUZZLES_DIR = path.join(DATA_DIR, 'puzzles');
const INDEX_FILE = path.join(DATA_DIR, 'puzzles.json');

// Helper to generate a dummy grid
function generateDummyPuzzle(id, title, cols, rows) {
    const grid = Array(cols * rows).fill('A');
    const gridnums = Array(cols * rows).fill(0);
    // Simple 1 to N down the side
    for(let i=0; i<rows; i++) gridnums[i * cols] = i + 1;
    
    return {
      id,
      title,
      author: "Nightcrossing Editor",
      date: "Starter Pack",
      size: { cols, rows },
      grid,
      gridnums,
      clues: {
        across: Array.from({length: rows}, (_, i) => `${i+1}. Across clue for row ${i+1}`),
        down: Array.from({length: cols}, (_, i) => `${i+1}. Down clue for col ${i+1}`)
      },
      answers: {
        across: Array(rows).fill('A'.repeat(cols)),
        down: Array(cols).fill('A'.repeat(rows))
      }
    };
}

const starters = [
    generateDummyPuzzle("starter-5x5", "The Warmup", 5, 5),
    generateDummyPuzzle("starter-10x10", "Standard Fare", 10, 10),
    generateDummyPuzzle("starter-15x15", "The Challenger", 15, 15)
];

let indexData = [];
if (fs.existsSync(INDEX_FILE)) {
    indexData = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
}

starters.forEach(p => {
    const outFile = path.join(PUZZLES_DIR, `${p.id}.json`);
    fs.writeFileSync(outFile, JSON.stringify(p, null, 2));
    
    if (!indexData.find(idx => idx.id === p.id)) {
        indexData.push({
            id: p.id,
            title: p.title,
            author: p.author,
            date: p.date,
            cols: p.size.cols,
            rows: p.size.rows
        });
    }
});

fs.writeFileSync(INDEX_FILE, JSON.stringify(indexData, null, 2));
console.log("Starter puzzles successfully generated and indexed!");
