import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { humanizeClue } from './humanizeClue.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const THEMES_FILE = path.join(__dirname, 'themes.json');

async function fetchThemeWords() {
  console.log('Fetching new words for themes...');
  
  if (!fs.existsSync(THEMES_FILE)) {
    console.error('themes.json not found!');
    process.exit(1);
  }

  const themes = JSON.parse(fs.readFileSync(THEMES_FILE, 'utf8'));
  let updatedCount = 0;

  for (let i = 0; i < themes.length; i++) {
    const theme = themes[i];
    // Use the theme name as the keyword. Datamuse works best with single words, so grab the most prominent word, or just use the full string.
    const keyword = theme.name.split(' & ')[0].toLowerCase();
    
    console.log(`\nQuerying Datamuse for: ${keyword}`);
    
    try {
      const res = await fetch(`https://api.datamuse.com/words?ml=${encodeURIComponent(keyword)}&md=d&max=100`);
      const data = await res.json();
      
      let added = 0;
      
      const existingAnswers = new Set(theme.words.map(w => w.answer.toUpperCase()));
      
      for (const d of data) {
        const word = d.word.toUpperCase();
        
        // Ensure no spaces/hyphens (must be single word for crossword layout generator easily)
        if (word.includes(' ') || word.includes('-')) continue;
        
        // Must be at least 3 letters
        if (word.length < 3) continue;
        
        // Ensure not already in our dictionary
        if (existingAnswers.has(word)) continue;
        
        if (d.defs && d.defs.length > 0) {
          // Parse definition: usually starts with "n\t" or "v\t"
          // We take the first definition for simplicity
          const rawDef = d.defs[0];
          const parts = rawDef.split('\t');
          let cleanDef = parts.length > 1 ? parts[1].trim() : parts[0].trim();
          
          // Remove leading parentheticals like (countable) or (meteorology)
          cleanDef = cleanDef.replace(/^\([^)]+\)\s*/, '');
          
          // Basic capitalized first letter
          cleanDef = cleanDef.charAt(0).toUpperCase() + cleanDef.slice(1);
          
          theme.words.push({
            answer: word,
            clue: humanizeClue(cleanDef)
          });
          existingAnswers.add(word);
          added++;
          updatedCount++;
        }
      }
      
      console.log(`Added ${added} new words to "${theme.name}"`);
    } catch (err) {
      console.error(`Error fetching for ${theme.name}:`, err.message);
    }
  }

  if (updatedCount > 0) {
    fs.writeFileSync(THEMES_FILE, JSON.stringify(themes, null, 2));
    console.log(`\nSuccess: Added totally ${updatedCount} new words across all themes.`);
  } else {
    console.log('\nNo new words added.');
  }
}

fetchThemeWords();
