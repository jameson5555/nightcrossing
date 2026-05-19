#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { annotateWordEntries } from './lexicalDifficulty.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const THEMES_FILE = path.join(__dirname, 'themes.json');

function loadThemes() {
  return JSON.parse(fs.readFileSync(THEMES_FILE, 'utf8'));
}

function hasLexicalChange(previousWord, nextWord) {
  return previousWord?.zipfFrequency !== nextWord?.zipfFrequency ||
    previousWord?.frequencyBand !== nextWord?.frequencyBand ||
    previousWord?.lexicalSource !== nextWord?.lexicalSource;
}

async function main() {
  const themes = loadThemes();
  let updatedWordCount = 0;
  const bandCounts = new Map();

  for (const theme of themes) {
    const words = Array.isArray(theme?.words) ? theme.words : [];
    const annotatedWords = await annotateWordEntries(words);

    annotatedWords.forEach((annotatedWord, index) => {
      if (hasLexicalChange(words[index], annotatedWord)) {
        updatedWordCount += 1;
      }

      const bandKey = annotatedWord.frequencyBand || 'unknown';
      bandCounts.set(bandKey, (bandCounts.get(bandKey) || 0) + 1);
    });

    theme.words = annotatedWords;
  }

  fs.writeFileSync(THEMES_FILE, JSON.stringify(themes, null, 2));

  const bandSummary = [...bandCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([band, count]) => `${band}:${count}`)
    .join(', ');

  console.log(`Annotated lexical metadata for ${updatedWordCount} theme words.`);
  console.log(`Frequency bands: ${bandSummary}`);
}

main().catch((err) => {
  console.error('Failed to annotate theme lexical metadata.', err);
  process.exit(1);
});