import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateThemedPuzzle, THEMES } from './proceduralEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../public/data');
const PUZZLES_DIR = path.join(DATA_DIR, 'puzzles');
const INDEX_FILE = path.join(DATA_DIR, 'puzzles.json');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PUZZLES_DIR)) fs.mkdirSync(PUZZLES_DIR, { recursive: true });

async function generateStarters() {
  console.log('Generating compact starter puzzles...');
  
  const index = [];
  const PUZZLES_PER_THEME = 3;

  for (const theme of THEMES) {
    for (let i = 1; i <= PUZZLES_PER_THEME; i++) {
        const id = `starter-${theme.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-vol${i}`;
        console.log(`Working on ${id}...`);
        
        let puzzle = generateThemedPuzzle(id, theme);
        puzzle.title = `${theme.name} Crossword Vol. ${i}`;
        puzzle.date = `Starter Pack Vol. ${i}`;
        
        // Save individual file
        fs.writeFileSync(
          path.join(PUZZLES_DIR, `${id}.json`), 
          JSON.stringify(puzzle, null, 2)
        );
        
        // Add to index
        index.push({
          id: puzzle.id,
          title: puzzle.title,
          author: puzzle.author,
          date: puzzle.date,
          cols: puzzle.size.cols,
          rows: puzzle.size.rows,
          theme: puzzle.theme
        });
        
        console.log(`Generated: ${puzzle.size.cols}x${puzzle.size.rows}`);
    }
  }

  // Write index
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
  console.log(`\nSuccessfully generated ${index.length} puzzles and saved index.`);
}

generateStarters();
