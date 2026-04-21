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

const REGENERATE = process.argv.includes('--regenerate');

async function generateStarters() {
  let index = [];
  
  if (REGENERATE) {
    console.log('🔄 REGENERATE MODE: Wiping existing puzzles and starting fresh...');
    // Delete all existing puzzle JSON files
    const existingFiles = fs.readdirSync(PUZZLES_DIR).filter(f => f.endsWith('.json'));
    for (const f of existingFiles) {
      fs.unlinkSync(path.join(PUZZLES_DIR, f));
    }
    console.log(`  Deleted ${existingFiles.length} existing puzzle files.`);
  } else {
    console.log('Generating incremental new puzzles...');
    if (fs.existsSync(INDEX_FILE)) {
      try {
        index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
      } catch(e) {
        console.warn("Could not parse existing puzzles.json, starting fresh.");
      }
    }
  }

  const NEW_PUZZLES_PER_THEME = 3;

  for (const theme of THEMES) {
    const consumedWords = new Set();
    
    // Calculate the current highest volume for this theme from the index
    const existingThemePuzzles = index.filter(p => p.theme === theme.name);
    let highestVol = 0;
    
    // Also scan disk for puzzle files not yet in the index
    const themePrefix = `starter-${theme.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-vol`;
    const diskFiles = fs.readdirSync(PUZZLES_DIR).filter(f => f.startsWith(themePrefix));
    for (const f of diskFiles) {
      const m = f.match(/-vol(\d+)\.json$/);
      if (m && parseInt(m[1]) > highestVol) highestVol = parseInt(m[1]);
    }
    
    for (const p of existingThemePuzzles) {
      const match = p.id.match(/-vol(\d+)$/);
      if (match && parseInt(match[1]) > highestVol) {
        highestVol = parseInt(match[1]);
      }
      
      // Load the actual JSON to see what words were used, to add to consumedWords
      try {
        const fileData = JSON.parse(fs.readFileSync(path.join(PUZZLES_DIR, `${p.id}.json`), 'utf8'));
        if (fileData.answers) {
            fileData.answers.across.forEach(ans => consumedWords.add(ans.toUpperCase()));
            fileData.answers.down.forEach(ans => consumedWords.add(ans.toUpperCase()));
        }
      } catch (err) {
        // file missing or corrupt, ignore
      }
    }
    
    // Also load consumed words from any disk-only puzzle files
    for (const f of diskFiles) {
      try {
        const fileData = JSON.parse(fs.readFileSync(path.join(PUZZLES_DIR, f), 'utf8'));
        if (fileData.answers) {
          fileData.answers.across.forEach(ans => consumedWords.add(ans.toUpperCase()));
          fileData.answers.down.forEach(ans => consumedWords.add(ans.toUpperCase()));
        }
      } catch (err) { /* ignore */ }
    }
    
    }
    
    const startVol = highestVol + 1;
    const endVol = highestVol + NEW_PUZZLES_PER_THEME;
    console.log(`\nTheme: [${theme.name}] currently has ${highestVol} volumes. Generating vol${startVol}-${endVol}...`);

    try {
        for (let i = startVol; i <= endVol; i++) {
            const id = `starter-${theme.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-vol${i}`;
            
            // Skip if this puzzle already exists on disk (from a previous partial run)
            const existingFile = path.join(PUZZLES_DIR, `${id}.json`);
            if (fs.existsSync(existingFile) && !index.find(p => p.id === id)) {
              try {
                const existing = JSON.parse(fs.readFileSync(existingFile, 'utf8'));
                if (existing.answers) {
                  existing.answers.across.forEach(a => consumedWords.add(a.toUpperCase()));
                  existing.answers.down.forEach(a => consumedWords.add(a.toUpperCase()));
                }
                index.push({ id: existing.id, title: existing.title, author: existing.author, date: existing.date, cols: existing.size.cols, rows: existing.size.rows, theme: existing.theme });
                console.log(`  ⏩ ${id} already exists on disk, added to index.`);
                continue;
              } catch(e) { /* corrupt file, regenerate */ }
            } else if (index.find(p => p.id === id)) {
              console.log(`  ⏩ ${id} already in index, skipping.`);
              continue;
            }
            
            const availableWords = theme.words.filter(w => !consumedWords.has(w.answer.toUpperCase()));
            
            if (availableWords.length < 10) {
               console.log(`Not enough available words pool for ${theme.name} to generate Vol ${i}. Add more words to themes.json!`);
               break;
            }

            const { puzzle, usedWords: placedWords } = generateThemedPuzzle(id, theme.name, availableWords);
            
            // Track the newly placed words so they aren't used in subsequent volumes
            placedWords.forEach(w => consumedWords.add(w));

            // Naming logic: use a shared Volume name for the entire batch
            // Since we already used 1, 2, 3 as individual volumes, the first batch starts at 4.
            // Actually, if highestVol is 3, start at batch 4. 
            // Let's just use the user's specific request: if i is 4, 5, or 6, it's Volume 4.
            const displayVolume = i >= 4 ? 4 + Math.floor((i - 4) / NEW_PUZZLES_PER_THEME) : i;

            puzzle.title = `${theme.name} ${i}`;
            puzzle.date = i >= 4 ? `Volume ${displayVolume}` : `Starter Pack Vol. ${i}`;
            
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
    } catch (themeErr) {
        console.error(`\n❌ Failed to generate batch for theme [${theme.name}]:`, themeErr.message);
    }
  }

  // Reconcile: add any disk-only puzzle files not yet in the index
  const allDiskFiles = fs.readdirSync(PUZZLES_DIR).filter(f => f.endsWith('.json'));
  const indexedIds = new Set(index.map(p => p.id));
  for (const f of allDiskFiles) {
    const fId = f.replace('.json', '');
    if (!indexedIds.has(fId)) {
      try {
        const p = JSON.parse(fs.readFileSync(path.join(PUZZLES_DIR, f), 'utf8'));
        index.push({ id: p.id, title: p.title, author: p.author, date: p.date, cols: p.size.cols, rows: p.size.rows, theme: p.theme });
        console.log(`  📎 Reconciled ${fId} into index.`);
      } catch(e) { /* skip corrupt */ }
    }
  }

  // Sort index by canonical theme order, then by volume number
  const themeOrder = THEMES.map(t => t.name);
  index.sort((a, b) => {
    const themeIdxA = themeOrder.indexOf(a.theme);
    const themeIdxB = themeOrder.indexOf(b.theme);
    if (themeIdxA !== themeIdxB) return themeIdxA - themeIdxB;
    
    const volA = parseInt((a.id.match(/-vol(\d+)$/) || [0, 0])[1]);
    const volB = parseInt((b.id.match(/-vol(\d+)$/) || [0, 0])[1]);
    return volA - volB;
  });

  // Write index
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
  console.log(`\nSuccess. Total puzzles tracked in index: ${index.length}`);
}

generateStarters();
