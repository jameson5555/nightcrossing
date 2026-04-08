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
  console.log('Generating incremental new puzzles...');
  
  let index = [];
  if (fs.existsSync(INDEX_FILE)) {
    try {
      index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    } catch(e) {
      console.warn("Could not parse existing puzzles.json, starting fresh.");
    }
  }

  const NEW_PUZZLES_PER_THEME = 3;

  for (const theme of THEMES) {
    const consumedWords = new Set();
    
    // Calculate the current highest volume for this theme
    const existingThemePuzzles = index.filter(p => p.theme === theme.name);
    let highestVol = 0;
    
    for (const p of existingThemePuzzles) {
      const match = p.id.match(/-vol(\d+)$/);
      if (match && parseInt(match[1]) > highestVol) {
        highestVol = parseInt(match[1]);
      }
      
      // Load the actual JSON to see what words were used, to add to consumedWords
      try {
        const fileData = JSON.parse(fs.readFileSync(path.join(PUZZLES_DIR, `${p.id}.json`), 'utf8'));
        if (fileData.across) {
            Object.values(fileData.across).forEach(wordObj => consumedWords.add(wordObj.answer.toUpperCase()));
        }
        if (fileData.down) {
            Object.values(fileData.down).forEach(wordObj => consumedWords.add(wordObj.answer.toUpperCase()));
        }
      } catch (err) {
        // file missing or corrupt, ignore
      }
    }
    
    console.log(`\nTheme: [${theme.name}] currently has ${highestVol} volumes. Generating ${NEW_PUZZLES_PER_THEME} more...`);

    for (let i = highestVol + 1; i <= highestVol + NEW_PUZZLES_PER_THEME; i++) {
        const id = `starter-${theme.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-vol${i}`;
        
        const availableWords = theme.words.filter(w => !consumedWords.has(w.answer.toUpperCase()));
        
        if (availableWords.length < 10) {
           console.log(`Not enough available words pool for ${theme.name} to generate Vol ${i}. Add more words to themes.json!`);
           break;
        }

        const { puzzle, usedWords: placedWords } = generateThemedPuzzle(id, theme.name, availableWords);
        
        // Track the newly placed words so they aren't used in subsequent volumes
        placedWords.forEach(w => consumedWords.add(w));

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
        
        console.log(`--> Saved ${id} (used ${placedWords.length} words, pool remaining: ${availableWords.length - placedWords.length})`);
    }
  }

  // Write index
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
  console.log(`\nSuccess. Total puzzles tracked in index: ${index.length}`);
}

generateStarters();
