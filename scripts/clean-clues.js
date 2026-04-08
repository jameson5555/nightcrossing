import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { humanizeClue } from './humanizeClue.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const THEMES_FILE = path.join(__dirname, 'themes.json');

async function cleanClues() {
  console.log('Cleaning existing themes.json clues...');
  
  if (!fs.existsSync(THEMES_FILE)) {
    console.error('themes.json not found!');
    process.exit(1);
  }

  const themes = JSON.parse(fs.readFileSync(THEMES_FILE, 'utf8'));
  let updatedCount = 0;

  for (let i = 0; i < themes.length; i++) {
    for (let j = 0; j < themes[i].words.length; j++) {
      const original = themes[i].words[j].clue;
      const humanized = humanizeClue(original);
      if (original !== humanized) {
        updatedCount++;
        themes[i].words[j].clue = humanized;
      }
    }
  }

  if (updatedCount > 0) {
    fs.writeFileSync(THEMES_FILE, JSON.stringify(themes, null, 2));
    console.log(`Success: Cleaned ${updatedCount} clues across all themes.`);
  } else {
    console.log('No clues needed cleaning.');
  }
}

cleanClues();
